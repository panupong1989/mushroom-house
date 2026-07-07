// Pure-function port of firmware/esp32-controller/src/{safety,control_fsm}.cpp
// ห้ามเปลี่ยนความหมาย (semantics) ของ ladder/interlock เดิม — ดู docs/03-control-logic.md
// เอาไว้ unit-test logic ฝั่ง backend; ESP32 ยังเป็น control loop ตัวจริง (edge-autonomous)

export interface Setpoints {
  tempHeaterOn: number; // 27.5 — ต่ำกว่านี้ heater ON, mist ห้าม ON เด็ดขาด
  tempHeaterOff: number; // 29.5
  tempExhaustOn: number; // 33.0
  tempDangerHot: number; // 38.0
  rhMin: number; // 85.0
  rhMax: number; // 90.0
  rhHigh: number; // 92.0
  bedDanger: number; // 40.0
  spawnBedMin: number; // 32.0
  spawnBedMax: number; // 35.0
  mistBurstMs: number; // 20_000
  mistGapMs: number; // 180_000
}

export const DEFAULT_SETPOINTS: Setpoints = {
  tempHeaterOn: 27.5,
  tempHeaterOff: 29.5,
  tempExhaustOn: 33.0,
  tempDangerHot: 38.0,
  rhMin: 85.0,
  rhMax: 90.0,
  rhHigh: 92.0,
  bedDanger: 40.0,
  spawnBedMin: 32.0,
  spawnBedMax: 35.0,
  mistBurstMs: 20_000,
  mistGapMs: 180_000,
};

export type Mode = 'SPAWN_RUN' | 'FRUITING';
export type AlertCode = 'LOW_WATER' | 'BED_OVERHEAT' | 'HOT' | null;

export interface SensorSnapshot {
  airTemp: number; // air_temp_ctrl (ค่าวิกฤต/สูงสุดจาก RS485 x3)
  airRh: number; // air_rh_ctrl (เฉลี่ย)
  bedTempMax: number;
  waterOk: boolean;
}

export interface ActuatorState {
  heater: boolean;
  mist: boolean;
  exhaust: boolean;
  circulation: boolean;
}

export const ALL_OFF: ActuatorState = { heater: false, mist: false, exhaust: false, circulation: false };

export interface MistTimerState {
  mistOn: boolean;
  msSinceChange: number;
}

export const IDLE_MIST_TIMER: MistTimerState = { mistOn: false, msSinceChange: 0 };

export interface ControlInput {
  sensors: SensorSnapshot;
  setpoints?: Setpoints;
  mode?: Mode;
  prevActuators?: ActuatorState;
  mistTimer?: MistTimerState;
}

export interface ControlOutput {
  actuators: ActuatorState;
  alert: AlertCode;
  tripped: boolean;
  mistTimer: MistTimerState;
}

// safety.cpp safety_check() — priority 1, เช็คก่อนเสมอ
function evaluateSafety(
  s: SensorSnapshot,
  sp: Setpoints,
  prev: ActuatorState
): { actuators: ActuatorState; alert: AlertCode } | null {
  if (!s.waterOk) {
    // น้ำต่ำ -> ปั๊ม/หมอก LOCK OFF (heater/exhaust ไม่ถูกแตะ เหมือน firmware)
    return { actuators: { ...prev, mist: false }, alert: 'LOW_WATER' };
  }
  if (s.bedTempMax >= sp.bedDanger) {
    return { actuators: { ...prev, heater: false, exhaust: true }, alert: 'BED_OVERHEAT' };
  }
  if (s.airTemp >= sp.tempDangerHot) {
    return { actuators: { ...prev, heater: false, exhaust: true, mist: true }, alert: 'HOT' };
  }
  return null;
}

// control_fsm.cpp handle_humidity() — priority 4, เฉพาะโซนทองและ T >= temp_heater_on
function evaluateHumidity(
  s: SensorSnapshot,
  sp: Setpoints,
  timer: MistTimerState
): { mist: boolean; circulation: boolean; mistTimer: MistTimerState } {
  if (s.airTemp < sp.tempHeaterOn) {
    return { mist: false, circulation: false, mistTimer: { mistOn: false, msSinceChange: 0 } };
  }
  if (s.airRh < sp.rhMin) {
    if (!timer.mistOn && timer.msSinceChange >= sp.mistGapMs) {
      return { mist: true, circulation: false, mistTimer: { mistOn: true, msSinceChange: 0 } };
    }
    if (timer.mistOn && timer.msSinceChange >= sp.mistBurstMs) {
      return { mist: false, circulation: false, mistTimer: { mistOn: false, msSinceChange: 0 } };
    }
    return { mist: timer.mistOn, circulation: false, mistTimer: timer };
  }
  if (s.airRh > sp.rhHigh) {
    return { mist: false, circulation: true, mistTimer: { mistOn: false, msSinceChange: timer.msSinceChange } };
  }
  return { mist: false, circulation: false, mistTimer: { mistOn: false, msSinceChange: timer.msSinceChange } };
}

// control_fsm.cpp control_step() FRUITING branch — priority 3, temp = master
function evaluateFruiting(
  s: SensorSnapshot,
  sp: Setpoints,
  prev: ActuatorState,
  mistTimer: MistTimerState
): { actuators: ActuatorState; mistTimer: MistTimerState } {
  const T = s.airTemp;

  if (T < sp.tempHeaterOn) {
    // เย็นไป — INTERLOCK เหล็ก: ห้ามพ่นหมอกเด็ดขาด
    return {
      actuators: { heater: true, mist: false, exhaust: false, circulation: prev.circulation },
      mistTimer: { mistOn: false, msSinceChange: 0 },
    };
  }

  if (T >= sp.tempExhaustOn) {
    // ร้อนไป — หมอกช่วยเย็นได้ถ้ายังไม่ชื้นเกิน rh_max
    const mist = s.airRh < sp.rhMax ? true : prev.mist;
    return {
      actuators: { heater: false, exhaust: true, mist, circulation: prev.circulation },
      mistTimer,
    };
  }

  // โซนทอง (temp_heater_off..temp_exhaust_on)
  const heater = T >= sp.tempHeaterOff ? false : prev.heater;
  const humidity = evaluateHumidity(s, sp, mistTimer);
  return {
    actuators: { heater, mist: humidity.mist, exhaust: prev.exhaust, circulation: humidity.circulation },
    mistTimer: humidity.mistTimer,
  };
}

// control_fsm.cpp control_step() SPAWN_RUN branch — เดินเส้นใย คุม bed_temp 32-35
function evaluateSpawnRun(s: SensorSnapshot, sp: Setpoints, prev: ActuatorState): ActuatorState {
  let heater = prev.heater;
  if (s.bedTempMax < sp.spawnBedMin) heater = true;
  else if (s.bedTempMax > sp.spawnBedMax) heater = false;
  return { ...prev, heater };
}

export function evaluateControl(input: ControlInput): ControlOutput {
  const sp = input.setpoints ?? DEFAULT_SETPOINTS;
  const mode = input.mode ?? 'FRUITING';
  const prevActuators = input.prevActuators ?? ALL_OFF;
  const mistTimer = input.mistTimer ?? IDLE_MIST_TIMER;
  const { sensors } = input;

  // main.cpp: safety_check() trip -> SAFE_HOLD, control_step() ไม่ถูกเรียกรอบนั้น
  const safety = evaluateSafety(sensors, sp, prevActuators);
  if (safety) {
    return { actuators: safety.actuators, alert: safety.alert, tripped: true, mistTimer };
  }

  if (mode === 'SPAWN_RUN') {
    return { actuators: evaluateSpawnRun(sensors, sp, prevActuators), alert: null, tripped: false, mistTimer };
  }

  const fruiting = evaluateFruiting(sensors, sp, prevActuators, mistTimer);
  let { actuators } = fruiting;
  if (actuators.heater && actuators.mist) {
    // INTERLOCK เหล็ก (docs/03-control-logic.md): heater กับ mist ห้าม ON พร้อมกัน
    // ชั้นป้องกันสุดท้ายกันกรณี hysteresis ของ heater คาบเกี่ยวกับ mist burst ในโซนทอง
    actuators = { ...actuators, mist: false };
  }
  return { actuators, alert: null, tripped: false, mistTimer: fruiting.mistTimer };
}
