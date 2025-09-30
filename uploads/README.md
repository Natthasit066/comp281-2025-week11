# 🌾 2D Landscape with Rain (Canvas)

โครงการนี้เป็นการวาดภาพทิวทัศน์ 2D ด้วย **HTML5 Canvas + JavaScript**  
มีองค์ประกอบ: ท้องฟ้า, ภูเขา, พระอาทิตย์, ทุ่งนา, ต้นไม้, บ้าน/กระท่อม (มีประตูหน้าต่าง), แม่น้ำ, ก้อนเมฆ, นก และ **ฝนตกแบบ Animation**

---

## 🚀 วิธีการรัน

1. สร้างโฟลเดอร์โปรเจกต์ แล้ววางไฟล์เหล่านี้
   - `index.html`
   - `main.js` (โค้ด JavaScript ด้านบน)
   - `utils-module.js` (โมดูลเล็ก ๆ สำหรับ `getContext`)

2. ตัวอย่าง `index.html`

   ```html
   <!DOCTYPE html>
   <html lang="th">
   <head>
       <meta charset="UTF-8">
       <meta name="viewport" content="width=device-width, initial-scale=1.0">
       <title>Landscape Scene with Rain</title>
   </head>
   <body>
       <canvas id="myCanvas"></canvas>
       <script type="module" src="main.js"></script>
   </body>
   </html>
