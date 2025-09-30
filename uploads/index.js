import { getContext } from "./utils-module.js";

document.title = "Landscape Scene with Rain";
document.addEventListener("DOMContentLoaded", main);

function main() {
    const ctx = getContext("#myCanvas");

    const config = {
        width: 800,
        height: 600,
        rainCount: 200
    };

    ctx.canvas.width = config.width;
    ctx.canvas.height = config.height;

    // สร้างหยดฝน
    const rainDrops = [];
    for (let i = 0; i < config.rainCount; i++) {
        rainDrops.push({
            x: Math.random() * config.width,
            y: Math.random() * config.height,
            length: 10 + Math.random() * 10,
            speed: 3 + Math.random() * 4
        });
    }

    // ฟังก์ชันวาดทั้งหมด
    function draw() {
        // ----------------------------
        // ท้องฟ้า gradient
        const skyGradient = ctx.createLinearGradient(0, 0, 0, config.height);
        skyGradient.addColorStop(0, "#09b1eaff");
        skyGradient.addColorStop(1, "#87CEFA");
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, config.width, config.height);

        // พระอาทิตย์
        ctx.beginPath();
        ctx.arc(700, 100, 50, 0, Math.PI * 2);
        ctx.fillStyle = "#ff4400ff";
        ctx.fill();
        ctx.closePath();

        // เมฆ
        function drawCloud(x, y, scale = 1) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.arc(x, y, 20 * scale, 0, Math.PI * 2);
            ctx.arc(x + 20 * scale, y - 10 * scale, 25 * scale, 0, Math.PI * 2);
            ctx.arc(x + 50 * scale, y, 20 * scale, 0, Math.PI * 2);
            ctx.arc(x + 35 * scale, y + 10 * scale, 22 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
        }
        drawCloud(150, 100, 1.2);
        drawCloud(400, 80, 0.8);
        drawCloud(600, 130, 1);

        // ภูเขา
        function drawMountain(x, y, width, height, color) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width / 2, y - height);
            ctx.lineTo(x + width, y);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }
        drawMountain(100, 400, 250, 200, "#556B2F");
        drawMountain(300, 500, 400, 180, "#62b342ff");
        drawMountain(500, 400, 250, 220, "#2E8B57");

        // ทุ่งนาใหญ่
        const fieldGradient = ctx.createLinearGradient(0, 400, 0, 600);
        fieldGradient.addColorStop(0, "#7CFC00");
        fieldGradient.addColorStop(1, "#076307ff");
        ctx.fillStyle = fieldGradient;
        ctx.fillRect(0, 400, config.width, 200);

        // เพิ่มทุ่งนาทางขวา
        ctx.fillStyle = "#496c04ff";
        ctx.fillRect(600, 450, 180, 100);
        ctx.strokeStyle = "#3f230cf1";
        ctx.strokeRect(600, 450, 180, 100);

        // ต้นไม้
        function drawTree(x, y) {
            ctx.fillStyle = "#8B4513";
            ctx.fillRect(x, y - 40, 20, 40);
            ctx.beginPath();
            ctx.arc(x + 10, y - 50, 30, 0, Math.PI * 2);
            ctx.fillStyle = "#247b0bff";
            ctx.fill();
            ctx.closePath();
        }
        drawTree(150, 420);
        drawTree(600, 430);
        drawTree(250, 460);

        // บ้าน/กระท่อม
        const houseX = 400;
        const houseY = 450;
        const houseWidth = 100;
        const houseHeight = 60;

        // ตัวบ้าน
        ctx.fillStyle = "#d21eb7ff";
        ctx.fillRect(houseX, houseY, houseWidth, houseHeight);

        // หลังคา
        ctx.fillStyle = "#100f0fff";
        ctx.beginPath();
        ctx.moveTo(houseX, houseY);
        ctx.lineTo(houseX + houseWidth/2, houseY - 40);
        ctx.lineTo(houseX + houseWidth, houseY);
        ctx.closePath();
        ctx.fill();

        // ประตู
        ctx.fillStyle = "#654321";
        ctx.fillRect(houseX + houseWidth/2 - 15, houseY + houseHeight - 30, 30, 30);

        // หน้าต่าง
        ctx.fillStyle = "#ADD8E6";
        ctx.fillRect(houseX + 10, houseY + 15, 20, 20);
        ctx.fillRect(houseX + houseWidth - 30, houseY + 15, 20, 20);

        // แม่น้ำ
        ctx.fillStyle = "#1E90FF";
        ctx.beginPath();
        ctx.moveTo(0, 500);
        ctx.bezierCurveTo(200, 620, 600, 400, 400, 500);
        ctx.lineTo(800, 600);
        ctx.lineTo(0, 600);
        ctx.closePath();
        ctx.fill();

        // นก
        function drawBird(x, y, scale = 1) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 10 * scale, y - 5 * scale);
            ctx.lineTo(x + 20 * scale, y);
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.closePath();
        }
        drawBird(100, 100, 1);
        drawBird(200, 150, 0.8);
        drawBird(300, 80, 1.2);
        drawBird(500, 120, 1);

        // ----------------------------
        // ฝนตก
        ctx.strokeStyle = "rgba(173,216,230,0.6)";
        ctx.lineWidth = 2;
        rainDrops.forEach(drop => {
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x, drop.y + drop.length);
            ctx.stroke();
            drop.y += drop.speed;
            if (drop.y > config.height) {
                drop.y = -drop.length;
                drop.x = Math.random() * config.width;
            }
        });

        // ----------------------------
        requestAnimationFrame(draw);
    }

    draw();
}
