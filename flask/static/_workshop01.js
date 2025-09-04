// ใช้ Socket.IO (ESM) จาก CDN เวอร์ชัน 4.8.1
import { io } from 'https://cdn.socket.io/4.8.1/socket.io.esm.min.js';

// รอให้ DOM พร้อมก่อนค่อยเริ่ม main()
document.addEventListener('DOMContentLoaded', main);

function main() {
	// -------------------- อ้างอิง element หลัก ๆ จากหน้า HTML --------------------
	const fileInput     = document.getElementById('fileInput');
	const connectBtn    = document.getElementById('connectButton');
	const confidence    = document.getElementById('confidence');
	const iou           = document.getElementById('iou');
	const tasksSelect   = document.getElementById('tasksSelect');
	const disconnectBtn = document.getElementById('disconnectButton');
	const videoElement  = document.getElementById('videoElement');
	const canvasOverlay = document.getElementById('canvasOverlay'); // วาดผลลัพธ์ทับบนวิดีโอ
	const canvasFrame   = document.getElementById('canvasFrame');   // เฟรมดิบสำหรับส่งขึ้นเซิร์ฟเวอร์
	const ctxOverlay    = canvasOverlay.getContext('2d');
	const ctxFrame      = canvasFrame.getContext('2d');

	// -------------------- การเชื่อมต่อเซิร์ฟเวอร์ Socket.IO --------------------
	const host = "https://comp281-2025.sleepless.dad/";  // โดเมนปลายทาง (HTTPS)
	const cid  = crypto.randomUUID();                    // client id แบบสุ่ม (ใช้ผูกห้อง/ติดตาม client)
	const socket = io(host, { autoConnect: false, query: { cid:cid } });

	let isConnected = false; // state: เชื่อมต่ออยู่หรือไม่

	// -------------------- ขนาดสูงสุดของวิดีโอ/แคนวาสเพื่อลดภาระเครื่อง --------------------
	const maxWidth  = 800;
	const maxHeight = 800;

	// -------------------- อัตราส่งเฟรมขึ้นเซิร์ฟเวอร์ --------------------
	// ส่งทุก 100 ms ~ 10 FPS (พอสำหรับเดโม่และทุ่นแบนด์วิธ)
	// NOTE: ถ้า CPU/GPU หนัก ให้เพิ่มตัวเลข (ช้าลง) เช่น 150–200 ms
	const streamInterval = 100; // milliseconds
	let intervalId = null;      // เก็บ id ของ setInterval ไว้หยุดตอน disconnect หรือเปลี่ยนไฟล์

	// -------------------- ข้อมูล label keypoints + skeleton สำหรับงาน pose --------------------
	const keypoints_name = [
		'Nose','Left Eye','Right Eye','Left Ear','Right Ear',
		'Left Shoulder','Right Shoulder','Left Elbow','Right Elbow',
		'Left Wrist','Right Wrist','Left Hip','Right Hip',
		'Left Knee','Right Knee','Left Ankle','Right Ankle'
	];

	// คู่ index ของ keypoints ที่ต้องเชื่อมกัน (วาดกระดูก)
	const skeleton = [
		[5, 7], [7, 9],        // แขนซ้าย
		[6, 8], [8,10],        // แขนขวา
		[11,13], [13,15],      // ขาซ้าย
		[12,14], [14,16],      // ขาขวา
		[5, 6],                // ไหล่
		[11,12],               // สะโพก
		[5,11], [6,12],        // ลำตัว
		[0, 1], [0, 2],        // จมูก-ตา
		[1, 3], [2, 4]         // ตา-หู
	];

	// โทนสีสำหรับวาด pose (สลับไปทีละคนในภาพ)
	const pose_colors = [
		{ kColor: "rgba(100,255,100,0.5)", sColor: "rgba(100,170,100,0.5)" },
		{ kColor: "rgba(255,100,100,0.5)", sColor: "rgba(170,100,100,0.5)" },
		{ kColor: "rgba(100,100,255,0.5)", sColor: "rgba(100,100,170,0.5)" },
		{ kColor: "rgba(255,255,100,0.5)", sColor: "rgba(170,170,100,0.5)" },
		{ kColor: "rgba(100,255,255,0.5)", sColor: "rgba(100,170,170,0.5)" },
		{ kColor: "rgba(255,255,255,0.5)", sColor: "rgba(100,110,100,0.8)"  }
	];

	// -------------------- จัดการ UI ตามสถานะการเชื่อมต่อ --------------------
	function UIUpdate(isConnected = false) {
		connectBtn.disabled    = isConnected;
		confidence.disabled    = !isConnected;
		iou.disabled           = !isConnected;
		tasksSelect.disabled   = !isConnected;
		disconnectBtn.disabled = !isConnected;
		if (!isConnected) resetVideo();
	}
	function resetVideo() {
		// เคลียร์ src แล้วโหลดใหม่ เพื่อหยุดการเล่น/คืนสถานะ
		// NOTE: ถ้าสร้าง URL ด้วย URL.createObjectURL ควร revoke ด้วย URL.revokeObjectURL() เมื่อไม่ใช้แล้ว
		videoElement.src = '';
		videoElement.load();
	}
	UIUpdate(isConnected); // เรียกครั้งแรกให้ UI เป็นสถานะเริ่มต้น

	// -------------------- เลือกไฟล์วิดีโอจากเครื่อง (STEP 1) --------------------
	fileInput.onchange = (event) => {
		const file = event.target.files[0];
		if (file) {
			// เมื่อ metadata โหลดเสร็จ เพื่อรู้ขนาดวิดีโอดั้งเดิม (videoWidth/Height)
			videoElement.onloadedmetadata = (event) => {
				const vw = videoElement.videoWidth;
				const vh = videoElement.videoHeight;

				// ย่อ/คงสัดส่วนให้ไม่เกิน maxWidth x maxHeight
				let w, h;
				if (vw > vh) { // landscape
					if (vw > maxWidth) {
						w = maxWidth;
						h = vh * (maxWidth / vw);
					} else {
						w = vw;
						h = vh;
					}
				} else {       // portrait
					if (vh > maxHeight) {
						w = vw * (maxHeight / vh);
						h = maxHeight;
					} else {
						w = vw;
						h = vh;
					}
				}

				// ตั้งขนาดให้ video และ canvas ทั้งสองผืนเท่ากัน
				videoElement.width  = w;
				videoElement.height = h;
				canvasOverlay.width  = w;
				canvasOverlay.height = h;
				canvasFrame.width    = w;
				canvasFrame.height   = h;
			}; // onloadedmetadata

			// สร้าง URL ชั่วคราวสำหรับไฟล์วิดีโอแล้วเล่น
			const videoURL = URL.createObjectURL(file);
			// TODO: เมื่อเปลี่ยนไฟล์/ออกจากหน้า ควรเรียก URL.revokeObjectURL(videoURL) เพื่อคืนหน่วยความจำ
			videoElement.src = videoURL;
			videoElement.play();

			// เริ่มลูปส่งเฟรมขึ้นเซิร์ฟเวอร์ตาม streamInterval
			if (intervalId) clearInterval(intervalId);
			intervalId = setInterval(() => {
				sendFrame(videoElement, canvasFrame, ctxFrame);
			}, streamInterval);
		}
	}; // onchange

	// -------------------- STEP 2: Connect / Disconnect --------------------
	connectBtn.onclick = () => {
		socket.connect();      // เปิดการเชื่อมต่อกับเซิร์ฟเวอร์
		isConnected = true;
		UIUpdate(isConnected);
	};

	disconnectBtn.onclick = () => {
		socket.disconnect();   // ปิดการเชื่อมต่อ
		isConnected = false;
		UIUpdate(isConnected);

		// หยุดลูปส่งเฟรม + เคลียร์ overlay
		clearInterval(intervalId);
		intervalId = null;
		ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
	};

	// -------------------- Socket.IO event handlers --------------------
	socket.on('connect', () => {
		console.log('Connected to server');
	});

	socket.on('disconnect', () => {
		console.log('Disconnected from server');
	});

	socket.on('message', (data) => {
		console.log('Received message:', data);
	});

	// เมื่อเซิร์ฟเวอร์ประมวลผลเฟรมเสร็จ
	socket.on('frame_processed', (data) => {
		console.log('Received processed video frame:', data);
		// NOTE: ขึ้นกับรูปแบบ payload จากฝั่งเซิร์ฟเวอร์
		// ในเดโม่นี้คาดหวัง { task: 'detect'|'segment'|..., result: [...] }
		switch (data.task) {
			case 'detect':   showDetectBB(ctxOverlay, data.result);   break;
			case 'segment':  showSegments(ctxOverlay, data.result);   break;
			case 'classify': showClassify(ctxOverlay, data.result);   break;
			case 'pose':     showPose(ctxOverlay, data.result);       break;
			case 'obb':      showDetectOBB(ctxOverlay, data.result);  break;
		}
	});

	socket.on('processing_error', (data) => {
		console.error('Error processing video frame:', data.error);
	});

	// -------------------- ฟังก์ชันส่งเฟรมขึ้นเซิร์ฟเวอร์ --------------------
	function sendFrame(videoElement, canvasFrame, ctxFrame) {
		// 1) วาดภาพจาก <video> ลง canvas ดิบ (เฟรมล่าสุด)
		ctxFrame.drawImage(videoElement, 0, 0, canvasFrame.width, canvasFrame.height);

		// 2) แปลงเป็น JPEG แบบ Base64
		// NOTE: Base64 มี overhead ~33%; ถ้าอยากลดขนาดเน็ต/หน่วง แนะนำใช้ canvas.toBlob แล้วส่งเป็น binary
		//   canvas.toBlob(cb, 'image/jpeg', 0.6) // ตัวอย่างลดคุณภาพเหลือ 60%
		const dataURL    = canvasFrame.toDataURL('image/jpeg'); // คุณภาพ default ~0.92
		const base64Image = dataURL.split(',')[1];

		// 3) ส่งขึ้นเซิร์ฟเวอร์ถ้ายังเชื่อมต่ออยู่
		if (isConnected) {
			const data = {
				task:  tasksSelect.value,
				imgB64: base64Image,
				params: {
					conf: parseFloat(confidence.value),
					iou:  parseFloat(iou.value)
				}
			};
			socket.emit('video_frame', data);
		}
	}

	// -------------------- วาดผลลัพธ์: Detect (BBox) --------------------
	function showDetectBB(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		result.forEach((r) => {
			// กล่องล้อมวัตถุ (x1,y1)-(x2,y2)
			let x = r.box.x1;
			let y = r.box.y1;
			let w = r.box.x2 - x;
			let h = r.box.y2 - y;

			ctx.strokeStyle = "rgb(0, 255, 0)";
			ctx.strokeRect(x, y, w, h);

			// ป้ายชื่อ + ความมั่นใจ (เงาสองชั้นให้อ่านง่ายขึ้น)
			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, x+1, y-9);
			ctx.fillStyle = "green";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, x,   y-10);
		});
	}

	// -------------------- วาดผลลัพธ์: Segment (Mask polygon) --------------------
	function showSegments(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		result.forEach((r) => {
			// วาด polygon จากพิกัดใน r.segments.x / r.segments.y
			let color = "rgba(100, 255, 100, 0.5)";
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.moveTo(r.segments.x[0], r.segments.y[0]);
			for (let i = 1; i < r.segments.x.length; i++) {
				ctx.lineTo(r.segments.x[i], r.segments.y[i]);
			}
			ctx.closePath();
			ctx.fill();

			// ป้ายชื่อที่มุมซ้ายบนของ bbox
			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1-1, r.box.y1-9);
			ctx.fillStyle = "green";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1,   r.box.y1-10);
		});
	}

	// -------------------- วาดผลลัพธ์: Classify (Top-k list) --------------------
	function showClassify(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		let sz = 15;
		ctx.font = `${sz}px Tahoma`;
		let x = 10, y = 25, padding = 5;

		result.forEach((r) => {
			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.conf * 100).toFixed(2)}%)`, x-2, y-2);
			ctx.fillStyle = "white";
			ctx.fillText(`${r.name} (${(r.conf * 100).toFixed(2)}%)`, x,   y);
			y += sz + padding;
		});
	}

	// -------------------- วาดผลลัพธ์: Pose (Keypoints + Skeleton) --------------------
	function showPose(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		let index = 0; // สลับชุดสีต่อวัตถุคนละคน
		result.forEach((r) => {
			// วาดเส้นเชื่อมตาม skeleton
			ctx.strokeStyle = pose_colors[index].sColor;
			ctx.lineWidth = 2;
			skeleton.forEach((pair) => {
				let kp1 = pair[0], kp2 = pair[1];
				let v1 = r.keypoints.visible[kp1];
				let v2 = r.keypoints.visible[kp2];
				let x1 = r.keypoints.x[kp1], y1 = r.keypoints.y[kp1];
				let x2 = r.keypoints.x[kp2], y2 = r.keypoints.y[kp2];
				// เฉพาะจุดที่ความมั่นใจเกิน threshold (0.7)
				if (v1 > 0.7 && v2 > 0.7) {
					ctx.beginPath();
					ctx.moveTo(x1, y1);
					ctx.lineTo(x2, y2);
					ctx.stroke();
				}
			});

			// วาดจุด keypoint เป็นวงกลม + label ชื่อจุด
			for (let i = 0; i < r.keypoints.visible.length; i++) {
				let v = r.keypoints.visible[i];
				let x = r.keypoints.x[i];
				let y = r.keypoints.y[i];
				if (v > 0.7) {
					ctx.beginPath();
					ctx.arc(x, y, 5, 0, 2 * Math.PI);
					ctx.fillStyle = pose_colors[index].kColor;
					ctx.fill();
					ctx.fillText(keypoints_name[i], x + 5, y - 5);
				}
			}

			// สลับสีไปชุดถัดไป (ถ้ามีหลายคน)
			if (index < pose_colors.length - 1) index++;
		});
	}

	// -------------------- วาดผลลัพธ์: OBB (Oriented Bounding Box) --------------------
	function showDetectOBB(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		result.forEach((r) => {
			ctx.strokeStyle = "rgb(0, 255, 0)";
			ctx.beginPath();
			ctx.moveTo(r.box.x1, r.box.y1);
			ctx.lineTo(r.box.x2, r.box.y2);
			ctx.lineTo(r.box.x3, r.box.y3);
			ctx.lineTo(r.box.x4, r.box.y4);
			ctx.closePath();
			ctx.stroke();

			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1+1, r.box.y1-9);
			ctx.fillStyle = "green";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1,   r.box.y1-10);
		});
	}
}
