import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { formatNumber } from '../../../utils/units';
import type { TrussModel } from '../models/truss';
import type { ResultIndex } from '../results/analysisRun';
import { COLORS, utilization, type ColorBy, type ResultsDisplay } from '../results/resultsView';

interface Props {
  model: TrussModel;
  index: ResultIndex | null;
  stale: boolean;
  display: ResultsDisplay;
  onDisplayChange: (d: ResultsDisplay) => void;
  modeIndex: number;
  onModeIndexChange: (i: number) => void;
  deformScale: number | null;
  onRun: () => void;
}

/** Floating panel on the canvas: result display controls, legend and status explanations. */
export function ResultsOverlay({ model, index, stale, display, onDisplayChange, modeIndex, onModeIndexChange, deformScale, onRun }: Props) {
  const [open, setOpen] = useState(true);
  if (!index) return null;
  const set = (patch: Partial<ResultsDisplay>) => onDisplayChange({ ...display, ...patch });

  let title: string;
  let tone: string;
  let body: React.ReactNode;

  if (stale) {
    title = 'Results out of date';
    tone = 'text-deformed';
    body = (
      <>
        <p>The model changed after the last analysis, so results are hidden.</p>
        <button
          type="button"
          onClick={onRun}
          className="mt-2 inline-flex items-center gap-1.5 rounded bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-ink hover:bg-accent-strong"
        >
          <Play className="size-3" aria-hidden="true" /> Run again (R)
        </button>
      </>
    );
  } else if (index.status === 'invalid') {
    title = 'Model has errors';
    tone = 'text-compression';
    body = <p>The analysis did not run. Problems are listed under Diagnostics, and affected items are highlighted in red.</p>;
  } else if (index.status === 'unstable') {
    const n = index.mechanismModes.length;
    title = 'Unstable structure';
    tone = 'text-compression';
    body = (
      <>
        <p>
          The structure can move without stretching any member. The dashed red shape shows mechanism mode {modeIndex + 1}
          {n > 1 ? ` of ${n}` : ''}. Add members or supports to remove it.
        </p>
        {n > 1 && (
          <div className="mt-2 flex items-center gap-1">
            <StepButton label="Previous mode" disabled={modeIndex === 0} onClick={() => onModeIndexChange(modeIndex - 1)}>
              <ChevronLeft className="size-3.5" />
            </StepButton>
            <span className="w-16 text-center font-mono text-[11px]">
              {modeIndex + 1} / {n}
            </span>
            <StepButton label="Next mode" disabled={modeIndex === n - 1} onClick={() => onModeIndexChange(modeIndex + 1)}>
              <ChevronRight className="size-3.5" />
            </StepButton>
          </div>
        )}
      </>
    );
  } else {
    title = 'Results';
    tone = 'text-reaction';
    body = <SolvedControls model={model} index={index} display={display} set={set} deformScale={deformScale} />;
  }

  return (
    <div className="absolute left-3 top-3 w-64 rounded-md border border-line bg-panel/95 text-[12px] text-muted shadow-lg shadow-black/30 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className={`font-medium ${tone}`}>{title}</span>
        <ChevronDown className={`size-3.5 text-faint transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-line px-3 py-2.5">{body}</div>}
    </div>
  );
}

function SolvedControls({
  model,
  index,
  display,
  set,
  deformScale,
}: {
  model: TrussModel;
  index: ResultIndex;
  display: ResultsDisplay;
  set: (p: Partial<ResultsDisplay>) => void;
  deformScale: number | null;
}) {
  const maxKN = formatNumber(index.maxAbsForce / 1e3, 3);
  const overYield = model.members.filter((m) => {
    const r = index.members.get(m.id);
    const u = r ? utilization(m, r) : null;
    return u !== null && u > 1;
  }).length;
  const noYield = model.members.filter((m) => m.yieldStrength === undefined).length;

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Colour members by" className="grid grid-cols-2 gap-1">
        {(
          [
            ['force', 'Axial force'],
            ['utilization', 'Utilisation'],
          ] as [ColorBy, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={display.colorBy === value}
            onClick={() => set({ colorBy: value })}
            className={`rounded border px-2 py-1 ${
              display.colorBy === value ? 'border-accent bg-accent/15 text-accent' : 'border-line-strong hover:bg-raised hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {display.colorBy === 'force' ? (
        <div>
          <div
            className="h-2 rounded-sm"
            style={{ background: `linear-gradient(to right, ${COLORS.compression}, ${COLORS.neutral} 50%, ${COLORS.tension})` }}
          />
          <div className="mt-1 flex justify-between font-mono text-[10.5px] tabular">
            <span className="text-compression">{maxKN} kN C</span>
            <span>0</span>
            <span className="text-tension">{maxKN} kN T</span>
          </div>
          <p className="mt-1 text-faint">Width scales with |N|. Zero-force members are dashed.</p>
        </div>
      ) : (
        <div>
          <div
            className="h-2 rounded-sm"
            style={{ background: `linear-gradient(to right, ${COLORS.ok}, ${COLORS.warn} 75%, ${COLORS.fail})` }}
          />
          <div className="relative mt-1 h-3.5 font-mono text-[10.5px] tabular">
            <span className="absolute left-0">0</span>
            <span className="absolute left-3/4 -translate-x-1/2">0.75</span>
            <span className="absolute right-0">≥ 1</span>
          </div>
          <p className="mt-1 text-faint">
            |σ| / σ<sub>y</sub>: yielding only. Buckling of compression members is not checked.
          </p>
          {overYield > 0 && (
            <p className="mt-1 text-compression">
              {overYield} member{overYield === 1 ? ' exceeds' : 's exceed'} the yield strength.
            </p>
          )}
          {noYield > 0 && <p className="mt-1 text-faint">{noYield} member(s) have no yield strength (grey).</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Check label="Deformed shape" checked={display.showDeformed} onChange={() => set({ showDeformed: !display.showDeformed })} />
        {display.showDeformed && deformScale !== null && (
          <div className="pl-6">
            <input
              type="range"
              min={-3}
              max={3}
              step={1}
              value={Math.round(Math.log2(display.deformMultiplier))}
              onChange={(e) => set({ deformMultiplier: 2 ** Number(e.target.value) })}
              aria-label="Deformation magnification"
              className="w-full accent-[var(--color-deformed)]"
            />
            <p className="font-mono text-[10.5px] text-faint">
              displacements × {formatNumber(deformScale, 3)} (largest {formatNumber(index.maxDisplacement * 1e3, 3)} mm)
            </p>
          </div>
        )}
        {display.showDeformed && deformScale === null && <p className="pl-6 text-faint">No displacement to show.</p>}
        <Check label="Reactions" checked={display.showReactions} onChange={() => set({ showReactions: !display.showReactions })} />
        <Check
          label={display.colorBy === 'force' ? 'Force values' : 'Factor of safety values'}
          checked={display.showValues}
          onChange={() => set({ showValues: !display.showValues })}
        />
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 hover:text-fg">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-3.5 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 place-items-center rounded border border-line-strong hover:bg-raised disabled:opacity-30"
    >
      {children}
    </button>
  );
}
