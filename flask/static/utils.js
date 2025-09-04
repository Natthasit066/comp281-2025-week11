function getContext(canavasId) {
	const canvas = document.querySelector(canavasId);
	const ctx = canvas.getContext("2d");

	return ctx;
}

let keys = {};
document.addEventListener("keydown", function(event) {
	keys[event.key] = true; // บันทึกปุ่มที่กด
});
document.addEventListener("keyup", function(event) {
	keys[event.key] = false; // ลบปุ่มที่ปล่อย
});

let mouse = { x: 0, y: 0, isDown: false };
document.addEventListener("mousemove", function(event) {
	mouse.x = event.offsetX; // ใช้ offsetX เพื่อให้ได้ตำแหน่งสัมพัทธ์กับ canvas
	mouse.y = event.offsetY; // ใช้ offsetY เพื่อให้ได้ตำแหน่งสัมพัทธ์กับ canvas
});
document.addEventListener("mousedown", function(event) {
	mouse.isDown = true; // ตั้งค่าว่าเมาส์กดอยู่
});
document.addEventListener("mouseup", function(event) {
	mouse.isDown = false; // ตั้งค่าว่าเมาส์ปล่อยแล้ว
});

let touch = { x: 0, y: 0, isDown: false };
document.addEventListener("touchmove", function(event) {
	const touchEvent = event.touches[0]; // ใช้ touch แรก (นิ้วแรก)
	touch.x = touchEvent.pageX - ctx.canvas.offsetLeft; // คำนวณตำแหน่งสัมพัทธ์กับ canvas
	touch.y = touchEvent.pageY - ctx.canvas.offsetTop; // คำนวณตำแหน่งสัมพัทธ์กับ canvas
});

export { getContext, keys, mouse, touch };