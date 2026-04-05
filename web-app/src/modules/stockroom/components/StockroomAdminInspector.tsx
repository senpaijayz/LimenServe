import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import type { SceneEntity, StockroomFloor } from '../types';

interface InspectorPatch {
  label: string;
  floorNumber: number;
  position: { x: number; y: number };
  rotation: number;
  size: { x: number; y: number; z: number };
  style: SceneEntity['style'];
}

interface StockroomAdminInspectorProps {
  entity: SceneEntity | null;
  floors: StockroomFloor[];
  busy?: boolean;
  onApply: (patch: InspectorPatch) => void;
  onRotate: (delta: number) => void;
  onDelete?: () => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function StockroomAdminInspector({
  entity,
  floors,
  busy = false,
  onApply,
  onRotate,
  onDelete,
}: StockroomAdminInspectorProps) {
  const [form, setForm] = useState<InspectorPatch | null>(null);

  useEffect(() => {
    if (!entity) {
      setForm(null);
      return;
    }

    setForm({
      label: entity.label,
      floorNumber: entity.floorNumber,
      position: entity.position,
      rotation: entity.rotation,
      size: entity.size,
      style: entity.style,
    });
  }, [entity]);

  const colorField = useMemo(() => {
    if (!entity) {
      return 'color';
    }
    return entity.kind === 'zone_overlay' ? 'zoneColor' : 'color';
  }, [entity]);

  if (!entity || !form) {
    return null;
  }

  return (
    <div className="absolute right-5 top-5 z-20 w-[320px] rounded-[24px] border border-white/10 bg-slate-950/88 p-4 text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Object Inspector</p>
          <h3 className="mt-2 text-lg font-semibold">{entity.label}</h3>
          <p className="text-xs text-slate-400">{entity.kind.replace(/_/g, ' ')}</p>
        </div>
        {onDelete && !entity.locked ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <Field label="Label">
          <input
            value={form.label}
            onChange={(event) => setForm((current) => current ? { ...current, label: event.target.value } : current)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Floor">
            <select
              value={form.floorNumber}
              onChange={(event) => setForm((current) => current ? { ...current, floorNumber: Number(event.target.value) } : current)}
              disabled={entity.kind === 'zone_overlay'}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {floors.map((floor) => (
                <option key={floor.id} value={floor.floorNumber}>
                  Floor {floor.floorNumber}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rotation">
            <input
              type="number"
              value={form.rotation}
              onChange={(event) => setForm((current) => current ? { ...current, rotation: Number(event.target.value) } : current)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pos X">
            <input
              type="number"
              step="0.25"
              value={form.position.x}
              onChange={(event) => setForm((current) => current ? { ...current, position: { ...current.position, x: Number(event.target.value) } } : current)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </Field>
          <Field label="Pos Y">
            <input
              type="number"
              step="0.25"
              value={form.position.y}
              onChange={(event) => setForm((current) => current ? { ...current, position: { ...current.position, y: Number(event.target.value) } } : current)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Width">
            <input
              type="number"
              step="0.1"
              value={form.size.x}
              onChange={(event) => setForm((current) => current ? { ...current, size: { ...current.size, x: Number(event.target.value) } } : current)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </Field>
          <Field label="Height">
            <input
              type="number"
              step="0.1"
              value={form.size.y}
              onChange={(event) => setForm((current) => current ? { ...current, size: { ...current.size, y: Number(event.target.value) } } : current)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </Field>
          <Field label="Depth">
            <input
              type="number"
              step="0.1"
              value={form.size.z}
              onChange={(event) => setForm((current) => current ? { ...current, size: { ...current.size, z: Number(event.target.value) } } : current)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/60"
            />
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Accent">
            <input
              type="color"
              value={String((form.style as Record<string, string | undefined>)[colorField] || '#38bdf8')}
              onChange={(event) => setForm((current) => current ? {
                ...current,
                style: {
                  ...current.style,
                  [colorField]: event.target.value,
                },
              } : current)}
              className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-2"
            />
          </Field>

          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Rotate</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onRotate(-15)}
                className="flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onRotate(15)}
                className="flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => onApply(form)}
          className="mt-2 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(59,130,246,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Saving Changes...' : 'Apply Changes'}
        </button>
      </div>
    </div>
  );
}

export default StockroomAdminInspector;
