#include "notify_edge.h"

bool alert_edge_update(AlertEdge &e, bool set_cond, bool clear_cond, uint32_t now_ms, uint32_t repost_ms) {
  if (set_cond) {
    bool post = false;
    if (!e.active) {
      // ขอบขาขึ้น — โพสต์ได้ถ้ายังไม่เคยโพสต์ หรือพ้น cooldown แล้ว
      // (uint32 ลบกันเอง = ทน millis() วนรอบที่ ~49.7 วัน)
      post = !e.posted || (uint32_t)(now_ms - e.last_post_ms) >= repost_ms;
    }
    e.active = true;   // ตั้ง active เสมอแม้รอบนี้ไม่โพสต์ (ติด cooldown) กันโพสต์รัวตอน cooldown หมด
    if (post) {
      e.posted = true;
      e.last_post_ms = now_ms;
    }
    return post;
  }

  if (clear_cond) e.active = false;   // กลับเข้าเขตปลอดภัยเกิน hysteresis -> ข้ามใหม่ค่อยโพสต์อีก
  return false;                       // อยู่ในแถบ hysteresis / ค่าอ่านไม่ได้ -> คงสถานะเดิม
}
