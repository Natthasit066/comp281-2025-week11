// ใช้ Socket.IO (ESM) จาก CDN เวอร์ชัน 4.8.1
import { io } from 'https://cdn.socket.io/4.8.1/socket.io.esm.min.js';

// รอ DOM พร้อมแล้วค่อยเริ่ม
document.addEventListener('DOMContentLoaded', main);

function main() {
	// -------------------- อ้างอิง element หลัก ๆ --------------------
	const startBtn       = document.getElementById('start');
	const webcamSelect   = document.getElementById('webcamSelect');
	const connectBtn     = document.getElementById('connectButton');
	const confidence     = document.getElementById('confidence');
	const iou            = document.getElementById('iou');
	const tasksSelect    = document.getElementById('tasksSelect');
	const disconnectBtn  = document.getElementById('disconnectButton');
	const videoElement   = document.getElementById('videoElement');
	const canvasOverlay  = document.getElementById('canvasOverlay'); // วาดผลลัพธ์ทับบนวิดีโอ
	const canvasFrame    = document.getElementById('canvasFrame');   // เฟรมดิบสำหรับส่งขึ้นเซิร์ฟเวอร์
	const ctxOverlay     = canvasOverlay.getContext('2d');
	const ctxFrame       = canvasFrame.getContext('2d');

	// -------------------- การเชื่อมต่อ Socket.IO --------------------
	const host = "https://comp281-2025.sleepless.dad/";  // ปลายทางเซิร์ฟเวอร์
	const cid  = crypto.randomUUID();                    // client id แบบสุ่ม
	const socket = io(host, { autoConnect: false, query: { cid:cid } });

	let isConnected = false; // state ของการเชื่อมต่อเซิร์ฟเวอร์

	// -------------------- กำหนดขนาดสูงสุดของวิดีโอ/แคนวาส --------------------
	const maxWidth  = 800;
	const maxHeight = 800;

	// -------------------- อัตราการส่งเฟรมขึ้นเซิร์ฟเวอร์ --------------------
	const streamInterval = 100; // ms (≈10 FPS) — พอสำหรับเดโม่ & ลดโหลด/แบนด์วิธ
	let intervalId = null;

	// -------------------- สำหรับแสดงผลลัพธ์แบบ Pose --------------------
	const keypoints_name = [
		'Nose','Left Eye','Right Eye','Left Ear','Right Ear',
		'Left Shoulder','Right Shoulder','Left Elbow','Right Elbow',
		'Left Wrist','Right Wrist','Left Hip','Right Hip',
		'Left Knee','Right Knee','Left Ankle','Right Ankle'
	];

	// คู่ index ของ keypoints ที่ต้องเชื่อมกัน (skeleton)
	const skeleton = [
		[5, 7], [7, 9],        // แขนซ้าย
		[6, 8], [8, 10],       // แขนขวา
		[11, 13], [13, 15],    // ขาซ้าย
		[12, 14], [14, 16],    // ขาขวา
		[5, 6],                // ไหล่
		[11, 12],              // สะโพก
		[5, 11], [6, 12],      // ลำตัว
		[0, 1], [0, 2],        // จมูก-ตา
		[1, 3], [2, 4]         // ตา-หู
	];

	// โทนสีสำหรับวาด pose (วนใช้ทีละชุดต่อแต่ละคน)
	const pose_colors =[
		{ kColor: "rgba(100,255,100,0.5)", sColor: "rgba(100,170,100,0.5)" },
		{ kColor: "rgba(255,100,100,0.5)", sColor: "rgba(170,100,100,0.5)" },
		{ kColor: "rgba(100,100,255,0.5)", sColor: "rgba(100,100,170,0.5)" },
		{ kColor: "rgba(255,255,100,0.5)", sColor: "rgba(170,170,100,0.5)" },
		{ kColor: "rgba(100,255,255,0.5)", sColor: "rgba(100,170,170,0.5)" },
		{ kColor: "rgba(255,255,255,0.5)", sColor: "rgba(100,110,100,0.8)" }
	];

	// -------------------- อัปเดต UI ตามสถานะเชื่อมต่อ --------------------
	function UIUpdate(isConnected = false) {
		connectBtn.disabled    = isConnected;
		confidence.disabled    = !isConnected;
		iou.disabled           = !isConnected;
		tasksSelect.disabled   = !isConnected;
		disconnectBtn.disabled = !isConnected;
		if (isConnected === false) {
			resetVideo();
		}
	}
	function resetVideo() {
		// รีเซ็ต video element
		videoElement.src = '';
		videoElement.load();
	}
	UIUpdate(isConnected); // เรียกครั้งแรก

	// -------------------- ตั้งขนาด canvas เท่ากับวิดีโอ เมื่อ metadata พร้อม --------------------
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
		} else { // portrait
			if (vh > maxHeight) {
				w = vw * (maxHeight / vh);
				h = maxHeight;
			} else {
				w = vw;
				h = vh;
			}
		}

		// ตั้งขนาด video/canvas ให้เท่ากัน
		videoElement.width   = w;
		videoElement.height  = h;
		canvasOverlay.width  = w;
		canvasOverlay.height = h;
		canvasFrame.width    = w;
		canvasFrame.height   = h;

		// เริ่ม loop ส่งเฟรมตาม interval ที่กำหนด (ฝั่ง sendFrame จะเช็ค isConnected ก่อน emit)
		if (intervalId) clearInterval(intervalId);
		intervalId = setInterval(() => {
			sendFrame(videoElement, canvasFrame, ctxFrame);
		}, streamInterval);
	}; // onloadedmetadata

	// -------------------- STEP 1: ขอสิทธิ์และเลือกกล้อง --------------------
	startBtn.onclick = () => {
		initCamera();
	};

	// -------------------- STEP 2: Connect / Disconnect --------------------
	connectBtn.onclick = () => {
		socket.connect();      // เปิด socket ไปยังเซิร์ฟเวอร์
		isConnected = true;
		UIUpdate(isConnected);
	};

	disconnectBtn.onclick = () => {
		socket.disconnect();   // ปิด socket
		isConnected = false;
		UIUpdate(isConnected);

		// หยุดลูปส่งเฟรม + เคลียร์ overlay
		clearInterval(intervalId);
		intervalId = null;
		ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
	};

	// -------------------- Socket.IO events --------------------
	socket.on('connect', () => {
		console.log('Connected to server');
	});

	socket.on('disconnect', () => {
		console.log('Disconnected from server');
	});

	socket.on('message', (data) => {
		console.log('Received message:', data);
	});

	socket.on('frame_processed', (data) => {
		console.log('Received processed video frame:', data);
		switch (data.task) {
			case 'detect':  showDetectBB(ctxOverlay, data.result);  break;
			case 'segment': showSegments(ctxOverlay, data.result);  break;
			case 'classify':showClassify(ctxOverlay, data.result);  break;
			case 'pose':    showPose(ctxOverlay, data.result);      break;
			case 'obb':     showDetectOBB(ctxOverlay, data.result); break;
		}
	});

	socket.on('processing_error', (data) => {
		console.error('Error processing video frame:', data.error);
	});

	// -------------------- ส่งเฟรมขึ้นเซิร์ฟเวอร์ --------------------
	function sendFrame(videoElement, canvasFrame, ctxFrame) {
		// 1) วาดภาพจาก <video> ลง canvas ดิบ (เฟรมล่าสุด)
		ctxFrame.drawImage(videoElement, 0, 0, canvasFrame.width, canvasFrame.height);

		// 2) แปลงเป็น JPEG (Base64)
		// NOTE: Base64 มี overhead ~33%; ถ้าต้องการลดแบนด์วิธ/หน่วง ให้ใช้ toBlob + ส่ง binary แทน
		const dataURL    = canvasFrame.toDataURL('image/jpeg'); // คุณภาพ default ~0.92
		const base64Image = dataURL.split(',')[1];

		// 3) ส่งขึ้นเซิร์ฟเวอร์ (เฉพาะเมื่อเชื่อมต่อแล้ว)
		if (isConnected) {
			const data = {
				task:   tasksSelect.value,
				imgB64: base64Image,
				params: {
					conf: parseFloat(confidence.value),
					iou:  parseFloat(iou.value),
				}
			};
			socket.emit('video_frame', data);
			// NOTE (optional): ลด latency โดยส่งแบบ in-flight ≤ 1 เฟรม (รอผลก่อนส่งถัดไป)
		}
	}

	// -------------------- วาดผล: Detect (BBox) --------------------
	function showDetectBB(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		result.forEach((r)=>{
			let x = r.box.x1;
			let y = r.box.y1;
			let w = r.box.x2 - x;
			let h = r.box.y2 - y;

			let lineColor = "rgb(0, 255, 0)";
			ctx.strokeStyle = lineColor;
			ctx.strokeRect(x, y, w, h);

			// ป้ายชื่อ + ความมั่นใจ (Drop shadow แบบง่าย)
			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, x+1, y - 9);
			ctx.fillStyle = "green";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, x,   y - 10);
		});
	}

	// -------------------- วาดผล: Segment (Mask polygon) --------------------
	function showSegments(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		result.forEach((r)=>{
			let color = "rgba(100, 255, 100, 0.5)";
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.moveTo(r.segments.x[0], r.segments.y[0]);
			for (let i = 1; i < r.segments.x.length; i++) {
				ctx.lineTo(r.segments.x[i], r.segments.y[i]);
			}
			ctx.closePath();
			ctx.fill();

			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1 - 1, r.box.y1 - 9);
			ctx.fillStyle = "green";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1,     r.box.y1 - 10);
		});
	}

	// -------------------- วาดผล: Classify (Top-k list) --------------------
	function showClassify(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		let sz = 15;
		ctx.font = `${sz}px Tahoma`;
		let x = 10, y = 25, padding = 5;

		result.forEach((r)=>{
			// ฝั่งเซิร์ฟเวอร์ส่ง r.conf เป็น 0..1 → คูณ 100 ตรงนี้ (โค้ดนี้ถูกต้อง)
			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.conf * 100).toFixed(2)}%)`, x-2, y-2);
			ctx.fillStyle = "white";
			ctx.fillText(`${r.name} (${(r.conf * 100).toFixed(2)}%)`, x,   y);
			y += sz + padding;
		});
	}

	// -------------------- วาดผล: Pose (Keypoints + Skeleton) --------------------
	function showPose(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		let index = 0; // ใช้สลับชุดสี
		result.forEach((r)=>{
			// วาดโครงกระดูกร่างกาย
			ctx.strokeStyle = pose_colors[index].sColor;
			ctx.lineWidth = 2;
			skeleton.forEach((pair)=>{
				let kp1 = pair[0];
				let kp2 = pair[1];
				let v1 = r.keypoints.visible[kp1];
				let v2 = r.keypoints.visible[kp2];
				let x1 = r.keypoints.x[kp1], y1 = r.keypoints.y[kp1];
				let x2 = r.keypoints.x[kp2], y2 = r.keypoints.y[kp2];
				if (v1 > 0.7 && v2 > 0.7 ) {
					ctx.beginPath();
					ctx.moveTo(x1, y1);
					ctx.lineTo(x2, y2);
					ctx.stroke();
				}
			});

			// วาดจุด keypoint + ชื่อจุด
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

			if (index < pose_colors.length - 1) index++;
		});
	}

	// -------------------- วาดผล: OBB (Oriented Bounding Box) --------------------
	function showDetectOBB(ctx, result) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		result.forEach((r)=>{
			let lineColor = "rgb(0, 255, 0)";
			ctx.strokeStyle = lineColor;
			ctx.beginPath();
			ctx.moveTo(r.box.x1, r.box.y1);
			ctx.lineTo(r.box.x2, r.box.y2);
			ctx.lineTo(r.box.x3, r.box.y3);
			ctx.lineTo(r.box.x4, r.box.y4);
			ctx.closePath();
			ctx.stroke();

			ctx.fillStyle = "black";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1+1, r.box.y1 - 9);
			ctx.fillStyle = "green";
			ctx.fillText(`${r.name} (${(r.confidence*100).toFixed(2)}%)`, r.box.x1,   r.box.y1 - 10);
		});
	}

	// -------------------- เริ่มต้นระบบกล้อง --------------------
	async function initCamera() {

		// ขอสิทธิ์เบื้องต้น (บางเบราว์เซอร์จะไม่เปิด label จนกว่าจะได้สิทธิ์)
		const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		// ปิดสตรีมชั่วคราว (เราแค่ต้องการสิทธิ์ & label สำหรับ enumerateDevices)
		tmp.getTracks().forEach(t => t.stop());

		// ดึงรายการอุปกรณ์ทั้งหมด แล้วกรองเอาเฉพาะ 'videoinput'
		navigator.mediaDevices.enumerateDevices()
		.then(devices => {
			devices.forEach(device => {
				// console.log(`${device.kind}: ${device.label} id = ${device.deviceId}`);
				if (device.kind === 'videoinput') {
					const option = document.createElement('option');
					option.value = device.deviceId; // ใช้ deviceId เป็น value
					option.textContent = device.label || `Webcam ${select.options.length + 1}`;
					webcamSelect.appendChild(option);
				}
			});
			webcamSelect.addEventListener('change', userSelectedCamera);
		})
		.catch(err => {
			console.error('ไม่สามารถเข้าถึงอุปกรณ์ได้:', err);
		});
	}

	// -------------------- เมื่อผู้ใช้เลือกกล้อง --------------------
	function userSelectedCamera(event) {
		// หยุด track เก่าก่อนจะเปลี่ยนกล้อง เพื่อไม่ให้กินทรัพยากร
		videoElement.srcObject?.getTracks().forEach(t => t.stop());
		videoElement.srcObject = null;

		const selectedDeviceId = webcamSelect.value;
		if (selectedDeviceId) {
			// ขอสิทธิ์ใช้งานกล้องที่เลือก (ระบุ deviceId แบบ exact)
			navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined
				}
			}).then(stream => {
				videoElement.srcObject = stream;
				videoElement.play();
				// NOTE: ถ้ากล้องใหม่มีสัดส่วนต่างไป ควร trigger ให้ onloadedmetadata ปรับขนาด canvas อีกครั้ง
			}).catch(err => {
				console.error("Error accessing webcam:", err);
			});
		}
	}
}
