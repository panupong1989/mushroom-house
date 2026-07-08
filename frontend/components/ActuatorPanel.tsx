import { Card } from './Card';
import { ActuatorRow } from './ActuatorRow';
import { ACTUATOR_KINDS, ACTUATOR_LABELS } from '@/lib/constants';
import { predictBlockReason } from '@/lib/interlock';
import type { DerivedTelemetry } from '@/lib/derive';

interface ActuatorPanelProps {
  telemetry: DerivedTelemetry;
  setpoints: Record<string, number>;
  locked: boolean;
  houseId: string;
}

export function ActuatorPanel({ telemetry, setpoints, locked, houseId }: ActuatorPanelProps) {
  return (
    <Card title="ควบคุมอุปกรณ์">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACTUATOR_KINDS.map((kind) => (
          <ActuatorRow
            key={kind}
            kind={kind}
            label={ACTUATOR_LABELS[kind]}
            isOn={telemetry.actuators[kind] ?? null}
            locked={locked}
            predictedBlock={predictBlockReason(kind, 'on', telemetry, setpoints)}
            houseId={houseId}
          />
        ))}
      </div>
      {locked && <p className="mt-3 text-xs text-gray-500">โหมด AUTO — ระบบควบคุมอุปกรณ์เอง ปุ่มถูกล็อกไว้</p>}
    </Card>
  );
}
