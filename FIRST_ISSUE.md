# วางข้อความนี้เป็น GitHub Issue แรก (เพื่อสั่ง Claude Code)

หัวข้อ (title):
  @claude implement v1

เนื้อหา (body):
---
@claude อ่าน CLAUDE.md และ docs/ ทั้งหมดก่อน แล้วทำ v1 ตาม "Definition of Done" ในไฟล์ CLAUDE.md

ทำทีละ PR เล็กๆ ตามลำดับใน CLAUDE.md:
1) ยืนยัน backend/db/migrate รันได้ (แก้ path ถ้าจำเป็น)
2) firmware: อ่าน DS18B20 x3 -> bed_temp_max + parse cmd/actuator, cmd/config, cmd/profile
3) unit test control ladder + interlock (T<27.5 ห้ามพ่นหมอก) — สำคัญสุด
4) backend: ingest bed/water + validate ช่วง setpoint
5) mock telemetry script สำหรับทดสอบ backend โดยไม่ต้องมีบอร์ด

ห้ามแตะ safety interlock โดยไม่มี test ครอบ. งานที่แตะ migration/firmware/safety ให้เปิดเป็น PR แยกให้ผมรีวิว. ทำ PR ทีละใบ อย่าลุยรวดเดียว (ประหยัดโควตา).
