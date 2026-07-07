// validate control_config setpoints ตาม docs/03-control-logic.md
// รับ config ที่ merge ค่าเดิม + ค่าใหม่แล้ว (ครบทุก key ที่มีอยู่จริงใน DB)
// cross-field check จะข้ามถ้า key ที่เกี่ยวข้องยังไม่มีค่า (เช่น house ใหม่ยังไม่มี config)

export interface ValidationError {
  key: string;
  message: string;
}

const TEMP_MIN = 0;
const TEMP_MAX = 60;
const RH_MIN = 0;
const RH_MAX = 100;

export function validateSetpoints(config: Record<string, number>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith('temp_') && (value < TEMP_MIN || value > TEMP_MAX)) {
      errors.push({ key, message: `${key} ต้องอยู่ในช่วง ${TEMP_MIN}-${TEMP_MAX}°C` });
    }
    if (key.startsWith('rh_') && (value < RH_MIN || value > RH_MAX)) {
      errors.push({ key, message: `${key} ต้องอยู่ในช่วง ${RH_MIN}-${RH_MAX}%` });
    }
  }

  const { temp_floor, temp_heater_on, temp_heater_off, temp_exhaust_on, rh_min, rh_max, rh_high } = config;

  if (temp_heater_on !== undefined && temp_heater_off !== undefined && !(temp_heater_on < temp_heater_off)) {
    errors.push({ key: 'temp_heater_on', message: 'temp_heater_on ต้องน้อยกว่า temp_heater_off' });
  }
  if (temp_heater_off !== undefined && temp_exhaust_on !== undefined && !(temp_heater_off < temp_exhaust_on)) {
    errors.push({ key: 'temp_heater_off', message: 'temp_heater_off ต้องน้อยกว่า temp_exhaust_on' });
  }
  if (temp_floor !== undefined && temp_heater_on !== undefined && !(temp_floor <= temp_heater_on)) {
    errors.push({ key: 'temp_floor', message: 'temp_floor ต้องน้อยกว่าหรือเท่ากับ temp_heater_on' });
  }
  if (rh_min !== undefined && rh_max !== undefined && !(rh_min < rh_max)) {
    errors.push({ key: 'rh_min', message: 'rh_min ต้องน้อยกว่า rh_max' });
  }
  if (rh_max !== undefined && rh_high !== undefined && !(rh_max <= rh_high)) {
    errors.push({ key: 'rh_max', message: 'rh_max ต้องน้อยกว่าหรือเท่ากับ rh_high' });
  }

  return errors;
}
