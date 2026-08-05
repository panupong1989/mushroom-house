#pragma once
#include "types.h"

// จำนวน DS18B20 สูงสุดที่ scan_all คืน (บัสจริง 7 ตัว = 6 ในกอง + 1 นอกโรง เผื่อไว้)
#define ONEWIRE_SCAN_MAX 12

void onewire_bed_begin();
// อ่าน DS18B20 ทั้ง 3 ตัว (หัว/กลาง/ท้าย ตามลำดับที่พบบนบัส) เติมลง out[3]
// ตัวไหนอ่านไม่ได้ -> out[i].ok=false และไม่เอามาคิด bed_temp_max
// bed_temp_max = ค่าสูงสุดของตัวที่ ok เท่านั้น (NAN ถ้าไม่มีตัวไหนอ่านได้เลย)
// หมายเหตุ: path นี้ป้อน safety interlock (bed_temp_max) — ไม่เปลี่ยน logic เดิม (ยังอ่าน 3)
void onewire_bed_read(BedReading out[3], float &bed_temp_max);

// อ่าน "ทุกตัวบนบัส" (ไม่ cap 3) สำหรับ live-mapping หน้า Maintenance — เติม ROM (hex 16 ตัว + null)
// ลง roms[i] และอุณหภูมิลง temps[i] (NAN ถ้าอ่านไม่ได้) คืนจำนวนที่เจอ (<= maxN)
// ⚠️ diagnostic/mapping เท่านั้น — ไม่ป้อน control/safety (bed_temp_max ยังมาจาก onewire_bed_read)
int onewire_scan_all(char roms[][17], float temps[], int maxN);
