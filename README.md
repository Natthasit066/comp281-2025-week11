## JavaScript Library (ES2015+ บนเบราว์เซอร์)
- **Socket.IO (Client)** — JavaScript WebSocket framework  
  <a href="https://socket.io/docs/v4/client-initialization/" target="_blank" rel="noopener noreferrer">https://socket.io/docs/v4/client-initialization/</a>

## Python Packages (Python 3.10+)
- **Flask** — Web framework สำหรับ backend/API  
- **numpy** — จัดการข้อมูลตัวเลขและโครงสร้างข้อมูลเชิงคณิตศาสตร์  
- **opencv-python-headless** — ไลบรารีประมวลผลภาพ (เวอร์ชันไม่มี GUI ใช้ในเซิร์ฟเวอร์/Flask)  
- **torch (PyTorch)** — Deep Learning engine (YOLO ใช้เป็น backend)  
- **ultralytics** — YOLO framework บน PyTorch (detection / segmentation / pose ฯลฯ)  
- **Flask-SocketIO** — เพิ่มความสามารถ WebSocket ให้ Flask  
  <a href="https://flask-socketio.readthedocs.io/en/latest/" target="_blank" rel="noopener noreferrer">https://flask-socketio.readthedocs.io/en/latest/</a>  
- **eventlet** — *ตัวเลือก (optional)* สำหรับโหมด async I/O คู่กับ Flask‑SocketIO *(เวิร์กชอปนี้ใช้โหมด **threading** เป็นหลัก)*  
  <a href="https://eventlet.readthedocs.io/en/latest/" target="_blank" rel="noopener noreferrer">https://eventlet.readthedocs.io/en/latest/</a>

> ℹ️ หมายเหตุ: ตัวอย่าง backend ในเวิร์กชอปนี้ใช้ **OS threads (threading)** จึงไม่จำเป็นต้องติดตั้ง eventlet เว้นแต่ต้องการทดลองโหมด async เพิ่มเติม

---

## สำหรับผู้ที่มี GPU (NVIDIA)
ตรวจสอบเวอร์ชัน CUDA **โดยการ** พิมพ์คำสั่ง:

```
nvidia-smi
```

ติดตั้ง `torch` ให้ตรงกับเวอร์ชัน CUDA (เลือก **เพียงหนึ่ง** บรรทัดให้ตรงกับเครื่อง):

- CUDA 12.6
```
pip install torch --index-url https://download.pytorch.org/whl/cu126
```
- CUDA 12.8
```
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
```
- CUDA 12.9
```
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu129
```

อ้างอิง: <https://pytorch.org/get-started/locally/>

---

## โครงสร้างโปรเจกต์ (Week11)
```text
flask/
├── static/
│   ├── _workshop01.js        # sample
│   ├── utils.js
│   ├── workshop01.js
│   └── workshop02.js
├── templates/
│   ├── index.html
│   ├── workshop01.html
│   └── workshop02.html
├── yolo_weights/
│   ├── yolo11m-cls.pt
│   ├── yolo11m-obb.pt
│   ├── yolo11m-pose.pt
│   ├── yolo11m-seg.pt
│   ├── yolo11m.pt
│   ├── yolo11n-cls.pt
│   ├── yolo11n-obb.pt
│   ├── yolo11n-pose.pt
│   ├── yolo11n-seg.pt
│   └── yolo11n.pt
├── _app.py                     # sample
├── app.py
└── imgcvt.py
```

---

## Workshops

### Workshop01 — YOLO Video Realtime (Code Template)
- **Frontend**: เลือกไฟล์วิดีโอ → ส่งภาพขึ้นเซิร์ฟเวอร์ (stream) → รับผลลัพธ์ YOLO แล้ววาด Overlay
- **Backend**: รับภาพ (stream) → YOLO predict → ส่งผลกลับ *(ตัวอย่างใช้ **threading**/OS Thread)*

### Workshop02 — YOLO WebCam Realtime (Code Sample)
- **Frontend**: เปิดกล้อง (WebCam/Smartphone) → ส่งภาพขึ้นเซิร์ฟเวอร์ (stream) → วาด Overlay  
- **Backend**: รับภาพ (stream) → YOLO predict → ส่งผลกลับ *(ตัวอย่างใช้ **threading**/OS Thread)*

> ⚠️ WebCam บนเบราว์เซอร์ต้องรันผ่าน **https** หรือ **localhost** เพื่อให้ `getUserMedia` ทำงาน

---

## ทำให้เข้าผ่าน HTTPS ด้วย Cloudflare (แบบที่นักเรียนทำได้)

เหมาะสำหรับเดโมในคลาส/แลบเร็ว ๆ และได้ URL `https://*.trycloudflare.com` ทันที

1. ติดตั้ง **cloudflared**
   - **Windows (แนะนำใช้ winget):** เปิด PowerShell แล้วรัน

```powershell
winget install -e --id Cloudflare.cloudflared
```

```
 > หากยังไม่มี WinGet ให้ติดตั้ง **App Installer** จาก Microsoft Store ก่อน
```

- **macOS:** `brew install cloudflared`
- **Linux (Debian/Ubuntu):** `sudo apt-get install cloudflared` (หรือดูคู่มือหน้าเว็บ)

2. รัน Flask/Socket.IO ที่เครื่องนักเรียน (เช่น `http://127.0.0.1:5000`)
3. เปิดเทอร์มินัลและรัน:

```bash
cloudflared tunnel --url http://127.0.0.1:5000
```

4. จะได้ URL สาธารณะ `https://<random>.trycloudflare.com` (รองรับ WebSocket/WSS) ให้คัดลอก URL นี้ไปใส่ใน **frontend**
   - ในไฟล์ JS: แก้ค่าตัวแปร `host` เป็น URL ที่ได้ เช่น

```js
const host = "https://<random>.trycloudflare.com";
```

> หมายเหตุ: โหมด Quick Tunnel มีข้อจำกัดด้านความคงทนของ URL และขีดจำกัดทราฟฟิก เหมาะกับเดโม/ฝึกหัด

## เพิ่มเติมที่ควรรู้

### Thread / Concurrency
- **Thread** เป็นหัวข้อในวิชาระบบปฏิบัติการ — ในเวิร์กชอปนี้นักเรียนจะได้ใช้จริงกับงานคอมพิวเตอร์วิทัศน์
- ดีไซน์ที่สอนใช้ **OS threads** + จำกัดการเข้าใช้ตัวประมวลผลด้วย `Semaphore` เพื่อกันแย่ง GPU/CPU พร้อมกัน

### การส่งข้อความด้วย Socket.IO
- พื้นฐาน:
```text
socket.send(message)          -> socket.on("message")   // event มาตรฐานชื่อ "message"
socket.emit("event", payload) -> socket.on("event")     // event กำหนดชื่อเอง
```
- Build‑in events:
```text
socket.on("connect"), socket.on("disconnect"), socket.on("message")
```
- Custom events (ตัวอย่าง):
```text
socket.on("game_update"), socket.on("private_notice")
```

### JSON ↔ Python Dict (Flask‑SocketIO)
- ถ้าส่ง JSON จากฝั่งเว็บ เช่น
```json
{
  "message": "MyText",
  "nums": 120
}
```
ฝั่ง Python จะได้รับเป็น `dict` ที่ `nums` เป็น **int 120** (ไม่ใช่ string) อยู่แล้ว  
หากต้องการบังคับชนิดเองจึงค่อยแปลงภายหลัง (เช่น `int(payload["nums"])`).

---

## การใช้


