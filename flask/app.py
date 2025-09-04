# --------------- IMPORT SECTION ---------------
# โหมดเพียว threading: ไม่ใช้ eventlet/monkey_patch เพื่อหลีกเลี่ยงปัญหา greenlet (python) <-> OS thread
# import eventlet
# eventlet.monkey_patch(thread=False)

from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room

from imgcvt import base64_cvimage
import torch
from ultralytics import YOLO
import json
import time

from concurrent.futures import ThreadPoolExecutor
import threading
import queue

# --------------- CONFIG SECTION ---------------
# เลือกอุปกรณ์คำนวณ: GPU ถ้ามี ไม่งั้นใช้ CPU
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
IS_CPU = (device.type == 'cpu')
IS_GPU = (device.type == 'cuda')

# จำนวนเธรดใน ThreadPool สำหรับงานหนัก
MAX_WORKERS = 4 if IS_GPU else 2   # GPU แรง → เปิดเยอะขึ้นได้ / CPU-only → ลดเพื่อกันแย่งคอร์
# จำกัดความยาวคิวงาน (กัน RAM พอง/กันค้าง)
MAX_JOB_QUEUE = MAX_WORKERS * 4
# รอบการตื่นของ dispatcher (วินาที) — ยิ่งเล็กยิ่งไว แต่กิน CPU มากขึ้น
DISPATCH_INTERVAL = 1/100
# จำกัด “จำนวนงานที่เข้าใช้ CPU/GPU พร้อมกัน” (กันคอขวด/กันหน่วง)
COMPUTE_CONCURRENT = 1
COMPUTE_GATE = threading.Semaphore(COMPUTE_CONCURRENT)  # gate ป้องกัน over-subscription ของตัวประมวลผล
# ขนาดภาพเข้าโมเดล (เล็กลง = เร็วขึ้น แต่รายละเอียด/ความแม่นยำลดลง)
PREDICT_IMGSIZE = 640 if IS_GPU else 320

# --------------- SHARED STATE (ต้องล็อกเมื่ออ่าน/เขียน) ---------------
# client_frame: เก็บ “เฟรมล่าสุด” ของแต่ละ client
# - payload: {task, imgB64, params:{conf, iou}}
# - seq: ลำดับเฟรมที่รับเข้ามา (เพิ่มขึ้นเรื่อย ๆ)
# - seen: ลำดับเฟรมที่ประมวลผล/ส่งผลแล้ว (ตามให้ทัน seq)
client_frame = {}              # dict[cid] -> {payload, seq, seen}
client_rrQueue = []            # รายชื่อ cid สำหรับจัดสรรคิวแบบ Round-Robin (fairness ต่อ client)
thread_lock = threading.Lock() # ล็อกกัน race ขณะอ่าน/เขียนสองโครงสร้างด้านบน
job_queue = queue.Queue(MAX_JOB_QUEUE)  # คิวงานเข้า worker (queue ของ stdlib เป็น thread-safe อยู่แล้ว)
result_queue = queue.Queue()            # คิวผลลัพธ์จาก worker -> dispatcher เพื่อ emit กลับ client

# ThreadPoolExecutor = “คนงาน” OS-level threads สำหรับงาน YOLO
thread_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)

# --------------- YOLO MODEL SECTION ---------------
# เลือกน้ำหนักตามเครื่อง: GPU ใช้รุ่นกลาง (m) / CPU ใช้รุ่นเล็ก (n)
_type = 'm' if IS_GPU else 'n'
models = {
	'detect':  YOLO(f"yolo_weights/yolo11{_type}.pt"),
	'segment': YOLO(f"yolo_weights/yolo11{_type}-seg.pt"),
	'classify':YOLO(f"yolo_weights/yolo11{_type}-cls.pt"),
	'pose':    YOLO(f"yolo_weights/yolo11{_type}-pose.pt"),
	'obb':     YOLO(f"yolo_weights/yolo11{_type}-obb.pt"),
}
for model in models.values():
	model.to(device)  # ย้ายไป GPU/CPU ตามที่เลือก

# --------------- YOLO Predict Worker (รันบน OS-Level Thread) ---------------
def yolo_frame_process(cid, payload):
	"""
	ทำ YOLO inference สำหรับเฟรมล่าสุดของ client 'cid'
	- หลีกเลี่ยงการแตะโครงสร้างแชร์ร่วมกันในฟังก์ชันนี้ (อ่านจาก payload ที่ส่งเข้ามาพอ)
	- ส่งผลลัพธ์กลับผ่าน result_queue เท่านั้น (emit ควรทำใน dispatcher)
	"""
	try:
		model = models[payload['task']]

		# แปลง BASE64 -> OpenCV image (BGR)
		frame = base64_cvimage(payload['imgB64'])

		# ดึงค่าพารามิเตอร์ (มี default กัน key หาย)
		conf = payload['params'].get('conf', 0.25)
		iou  = payload['params'].get('iou', 0.45)

		# จำกัด concurrent เข้าใช้ตัวประมวลผล (กัน contention ของ GPU/CPU)
		with COMPUTE_GATE:
			results = model.predict(
				frame,
				conf=conf,
				iou=iou,
				imgsz=PREDICT_IMGSIZE,
				verbose=False
				# NOTE: ถ้าใช้ GPU และรองรับ FP16 อาจลอง half=True เพื่อความเร็ว (ขึ้นกับรุ่น)
				# half=IS_GPU
			)
		r0 = results[0]

		# เตรียมผลลัพธ์ให้เป็น JSON-friendly
		if payload['task'] == 'classify':
			p = r0.probs
			top5 = [int(v) for v in p.top5]
			top5conf = [float(v) for v in p.top5conf]  # NOTE: ค่านี้อยู่ในช่วง 0..1
			names5 = [r0.names[v] for v in p.top5]
			output = [{'class': cls, 'conf': confv, 'name': n} for cls, confv, n in zip(top5, top5conf, names5)]
		else:
			output = json.loads(r0.to_json())

		# ส่งผลลัพธ์กลับผ่านคิว (ไม่ emit ที่นี่)
		try:
			result_queue.put_nowait((cid, 'frame_processed', {'task': payload['task'], 'result': output}))
		except Exception:
			# ถ้าคิวเต็ม → ทิ้งผลลัพธ์เพื่อรักษา latency (อย่าบล็อก worker)
			print(f"Result queue is full, skipping result for client {cid}")

	except Exception as e:
		print(f"Error processing frame for client {cid}: {e}")
		try:
			result_queue.put_nowait((cid, 'processing_error', {'error': str(e)}))
		except Exception:
			print(f"Result queue is full, skipping error for client {cid}")

# --------------- DISPATCHER (background thread ของเราเอง) ---------------
def dispatcher_loop():
	"""
	ลูปกลางที่ทำ 3 อย่าง:
	1) เลือกแบบ RR แล้วคิว “งานล่าสุด” ต่อ client เข้า job_queue (ใช้ seq/seen เพื่อทิ้งเฟรมเก่า)
	2) ดึงงานจาก job_queue ส่งเข้า ThreadPoolExecutor (ไม่เกิน MAX_WORKERS ต่อรอบ)
	3) ดึงผลลัพธ์จาก result_queue → อัปเดต seen (ใน Lock สั้น ๆ) → emit กลับ client (นอก Lock)
	"""
	rr_index = 0
	while True:
		time.sleep(DISPATCH_INTERVAL)

		# -------- (1) เลือกงานตาม RR และคิวงานล่าสุดต่อ client --------
		# TODO: เลือกงานจาก client_rrQueue แบบ Round-Robin ใส่ใน job_queue

		# -------- (2) ส่งงานเข้าหมวด worker (จำกัดไม่เกิน MAX_WORKERS ต่อรอบ) --------
		# TODO: ข้อมูล cid, payload:{task, imgB64, params:{conf, iou}} จาก job_queue

		# -------- (3) ส่งผลลัพธ์จาก worker กลับไปหา client --------
		# TODO: ข้อมูล cid, event_name, data:{task, result} จาก result_queue และจัดการป้องกันการทำซ้ำ frame ที่ส่งมา
		

# --------------- FLASK/SOCKETIO SECTION ---------------
app = Flask(__name__)
socketio = SocketIO(
	app,
	async_mode='threading',   # ใช้โหมด threading ล้วน (เข้าใจง่าย/ไม่ชน greenlet ของ python)
	cors_allowed_origins='*'
)

# --------------- SOCKETIO EVENT SECTION ---------------
@socketio.on('connect')
def on_connect():
	"""
	- สร้างห้องเฉพาะของ client (cid)
	- ใส่ cid ลง RR list (ภายใต้ lock)
	"""
	sid = request.sid  # session id
	cid = request.args.get('cid', sid)  # ให้ client ระบุ cid เองได้; ไม่งั้นใช้ sid
	join_room(cid)
	print(f"Client \"{cid}\" connected.")
	# TODO: เพิ่มข้อมูลลง client_rrQueue

@socketio.on('disconnect')
def on_disconnect():
	"""
	- ลบข้อมูล client ออกจาก state ทั้งหมด
	- เอาออกจาก RR list
	"""
	sid = request.sid
	cid = request.args.get('cid', sid)
	leave_room(cid)
	print(f"Client \"{cid}\" disconnected")
	# TODO: ลบข้อมูลออกจาก client_frame และ client_rrQueue

@socketio.on('video_frame')
def on_video_frame(data):
	"""
	รับเฟรมจาก client:
	- เก็บ payload ล่าสุดลง client_frame[cid]
	- เพิ่ม seq เมื่อมีเฟรมใหม่เข้า
	- ถ้ายังไม่อยู่ใน RR list ให้ใส่เข้าไป
	* ไม่ทำงานหนักใน def นี้ (ลด latency ของ event loop)
	"""
	sid = request.sid
	cid = request.args.get('cid', sid)
	# TODO: เพิ่ม payload {'task','imgB64','params':{...}} ลง client_frame และจัดการ client_rrQueue
	

# --------------- FLASK ROUTE SECTION ---------------
@app.route('/')  # index
def index():
	return render_template('index.html')

@app.route('/workshop01')  # /workshop01
def workshop01():
	return render_template('workshop01.html')

@app.route('/workshop02')  # /workshop02
def workshop02():
	return render_template('workshop02.html')

# --------------- MAIN PROGRAM SECTINO ---------------
if __name__ == '__main__':
	# สตาร์ท dispatcher เป็น background thread (OS thread) ของเราเอง
	# TODO: รัน dispatcher_loop เป็น thread สำหรับงานหลัก

	_host = '0.0.0.0'
	_port = 5000
	_debug = True
	# หมายเหตุ: โหมด threading มัก fallback เป็น long-polling กับ werkzeug (python WSGI server)
	# ถ้าต้องการ WebSocket จริง ๆ ให้รันหลัง gevent/gunicorn หรือไป eventlet + tpool
	socketio.run(app=app, host=_host, port=_port, debug=_debug)
