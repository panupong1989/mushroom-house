#pragma once
#include "types.h"
void onewire_bed_begin();
// อ่าน DS18B20 ทั้ง 3 ตัว (หัว/กลาง/ท้าย ตามลำดับที่พบบนบัส) เติมลง out[3]
// ตัวไหนอ่านไม่ได้ -> out[i].ok=false และไม่เอามาคิด bed_temp_max
// bed_temp_max = ค่าสูงสุดของตัวที่ ok เท่านั้น (NAN ถ้าไม่มีตัวไหนอ่านได้เลย)
void onewire_bed_read(BedReading out[3], float &bed_temp_max);
