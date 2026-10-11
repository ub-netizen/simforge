import { useId, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { NumberField, positive } from '../../../components/NumberField';
import { formatNumber, fromSI, toSI } from '../../../utils/units';
import {
  DEFAULT_LOAD,
  SUPPORT_TYPES,
  findMemberBetween,
  makeSupport,
  nextMemberId,
  nextNodeId,
  parseKey,
  selKey,
  supportType,
  type EditorAction,
  type EditorState,
  type MemberPatch,
  type SelectionKey,
} from '../editor/editorState';
import type { TrussMember, TrussSupport } from '../models/truss';
import { MATERIALS, getMaterial } from '../models/materials';
import type { ResultIndex } from '../results/analysisRun';
import { denoise, utilization, yieldFactorOfSafety } from '../results/resultsView';

export interface ViewSettings {
  showGrid: boolean;
  onToggleGrid: () => void;
  snap: boolean;
  onToggleSnap: () => void;
  snapStep: number | null;
  showLabels: boolean;
  onToggleLabels: () => void;
}

interface Props {
  editor: EditorState;
  dispatch: (a: EditorAction) => void;
  view: ViewSettings;
  /** Results of a successful analysis of the current model, or null (none, failed or out of date). */
  results: ResultIndex | null;
  onClose: () => void;
}

export function PropertiesPanel({ editor, dispatch, view, results, onClose }: Props) {
  const { selection } = editor;
  const single = selection.length === 1 ? parseKey(selection[0]!) : null;

  let body: React.ReactNode;
  if (selection.length === 0) body = <ModelOverview editor={editor} dispatch={dispatch} view={view} />;
  else if (single?.kind === 'member') body = <MemberProperties id={single.id} editor={editor} dispatch={dispatch} results={results} />;
  else if (single) body = <NodeProperties id={single.id} focus={single.kind} editor={editor} dispatch={dispatch} results={results} />;
  else body = <MultiProperties editor={editor} dispatch={dispatch} />;

  return (
    <aside
      aria-label="Properties"
      className="absolute inset-y-12 right-0 z-10 flex w-72 shrink-0 flex-col border-l border-line bg-panel shadow-2xl shadow-black/40 lg:static lg:shadow-none"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Properties</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close properties panel"
          className="grid size-6 place-items-center rounded text-faint hover:bg-raised hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto text-sm">{body}</div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function ModelOverview({ editor, dispatch, view }: { editor: EditorState; dispatch: Props['dispatch']; view: ViewSettings }) {
  const { model, defaults } = editor;
  const m = model.members.length;
  const n = model.nodes.length;
  const r = model.supports.reduce((sum, s) => sum + Number(s.restrainX) + Number(s.restrainY), 0);
  const degree = m + r - 2 * n;

  return (
    <>
      <Section title="Model">
        <Row label="Nodes" value={String(n)} mono />
        <Row label="Members" value={String(m)} mono />
        <Row label="Supports" value={`${model.supports.length} (r = ${r})`} mono />
        <Row label="Loads" value={String(model.loads.length)} mono />
        {n > 0 && (
          <div className="mt-2 rounded border border-line bg-bg px-2.5 py-2 text-[12px]">
            <div className="flex justify-between font-mono tabular">
              <span className="text-muted">m + r − 2n</span>
              <span className={degree < 0 ? 'text-compression' : 'text-fg'}>{degree}</span>
            </div>
            <p className="mt-1 text-faint">
              {degree < 0
                ? 'Fewer restraints than degrees of freedom: the structure cannot be stable.'
                : degree === 0
                  ? 'Statically determinate if stable.'
                  : `Statically indeterminate to degree ${degree} if stable.`}{' '}
              This is a counting check only; stability is verified when the model is analysed.
            </p>
          </div>
        )}
      </Section>

      <Section title="Add by coordinates">
        <AddNodeForm editor={editor} dispatch={dispatch} />
        {n >= 2 && <AddMemberForm editor={editor} dispatch={dispatch} />}
        <p className="mt-2 text-[12px] text-faint">Keyboard alternative to drawing on the canvas.</p>
      </Section>

      {n > 0 && (
        <Section title="Find item">
          <FindItem editor={editor} dispatch={dispatch} />
        </Section>
      )}

      <Section title="New members">
        <MaterialFields
          values={{ E: defaults.E, A: defaults.A, yieldStrength: defaults.yieldStrength ?? null, material: defaults.material ?? 'custom' }}
          onPatch={(patch) => dispatch({ type: 'setDefaults', patch })}
        />
        <p className="mt-1 text-[12px] text-faint">Applied to members you draw next.</p>
      </Section>

      <Section title="View">
        <Toggle label="Show grid" shortcut="G" checked={view.showGrid} onChange={view.onToggleGrid} />
        <Toggle label="Snap to grid" checked={view.snap} onChange={view.onToggleSnap} />
        <Toggle label="Show labels" shortcut="L" checked={view.showLabels} onChange={view.onToggleLabels} />
        {view.snapStep !== null && <Row label="Snap step" value={`${view.snapStep} m`} mono />}
        <p className="mt-1 text-[12px] text-faint">The snap step follows the minor grid. Hold Alt to place freely.</p>
      </Section>

      <Section title="Units">
        <p className="text-[12px] text-muted">
          Inputs use m, kN, GPa and mm². Models are stored and solved in SI (m, N, Pa, m²).
        </p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function NodeProperties({
  id,
  focus,
  editor,
  dispatch,
  results,
}: {
  id: string;
  focus: 'node' | 'support' | 'load';
  editor: EditorState;
  dispatch: Props['dispatch'];
  results: ResultIndex | null;
}) {
  const { model } = editor;
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return null;
  const support = model.supports.find((s) => s.nodeId === id);
  const load = model.loads.find((l) => l.nodeId === id);
  const type = support ? supportType(support) : null;
  const connected = model.members.filter((m) => m.nodeI === id || m.nodeJ === id);
  const subtitle = focus === 'support' ? 'Support selected' : focus === 'load' ? 'Load selected' : null;

  return (
    <>
      <Header title={`Node ${id}`} subtitle={subtitle} onDelete={() => dispatch({ type: 'deleteSelection' })} deleteLabel={`Delete ${focus}`} />

      {results && <NodeResults id={id} hasSupport={Boolean(support)} results={results} />}

      <Section title="Position">
        <NumberField label="x" unit="m" value={node.x} onCommit={(x) => dispatch({ type: 'moveNodes', positions: { [id]: { x, y: node.y } } })} />
        <NumberField label="y" unit="m" value={node.y} onCommit={(y) => dispatch({ type: 'moveNodes', positions: { [id]: { x: node.x, y } } })} />
      </Section>

      <Section title="Support" highlight={focus === 'support'}>
        <div role="radiogroup" aria-label="Support type" className="grid grid-cols-4 gap-1">
          {[{ type: null, label: 'None', description: 'Free joint' }, ...SUPPORT_TYPES].map((opt) => {
            const active = type === opt.type;
            return (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={active}
                title={opt.description}
                onClick={() =>
                  dispatch({ type: 'setSupport', nodeId: id, support: opt.type ? makeSupport(id, opt.type, support) : null })
                }
                className={`rounded border px-1 py-1.5 text-[11.5px] ${
                  active ? 'border-accent bg-accent/15 text-accent' : 'border-line-strong text-muted hover:bg-raised hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {support && (
          <div className="mt-2">
            {support.restrainX && (
              <NumberField
                label="Settlement x"
                unit="mm"
                value={fromSI(support.settlementX ?? 0, 'displacement')}
                title="Prescribed support displacement in x"
                onCommit={(v) => dispatch({ type: 'setSupport', nodeId: id, support: withSettlement(support, 'settlementX', toSI(v, 'displacement')) })}
              />
            )}
            {support.restrainY && (
              <NumberField
                label="Settlement y"
                unit="mm"
                value={fromSI(support.settlementY ?? 0, 'displacement')}
                title="Prescribed support displacement in y"
                onCommit={(v) => dispatch({ type: 'setSupport', nodeId: id, support: withSettlement(support, 'settlementY', toSI(v, 'displacement')) })}
              />
            )}
          </div>
        )}
      </Section>

      <Section title="Load" highlight={focus === 'load'}>
        {load ? (
          <>
            <NumberField
              label="Fx"
              unit="kN"
              value={fromSI(load.fx, 'force')}
              onCommit={(v) => dispatch({ type: 'setLoad', nodeId: id, load: { fx: toSI(v, 'force'), fy: load.fy } })}
            />
            <NumberField
              label="Fy"
              unit="kN"
              value={fromSI(load.fy, 'force')}
              onCommit={(v) => dispatch({ type: 'setLoad', nodeId: id, load: { fx: load.fx, fy: toSI(v, 'force') } })}
            />
            <Row label="Magnitude" value={`${formatNumber(Math.hypot(load.fx, load.fy) / 1e3)} kN`} mono />
            <button
              type="button"
              onClick={() => dispatch({ type: 'setLoad', nodeId: id, load: null })}
              className="mt-1 text-[12px] text-muted hover:text-compression"
            >
              Remove load
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'batch', actions: [{ type: 'setLoad', nodeId: id, load: DEFAULT_LOAD }, { type: 'select', keys: [selKey('load', id)] }] })
            }
            className="rounded border border-line-strong px-2.5 py-1.5 text-[12px] text-muted hover:bg-raised hover:text-fg"
          >
            Add load (10 kN down)
          </button>
        )}
        <p className="mt-2 text-[12px] text-faint">Positive x is right, positive y is up.</p>
      </Section>

      <Section title={`Members (${connected.length})`}>
        {connected.length === 0 ? (
          <p className="text-[12px] text-faint">Not connected to any member.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {connected.map((m) => (
              <ChipButton key={m.id} onClick={() => dispatch({ type: 'select', keys: [selKey('member', m.id)] })}>
                {m.id}
              </ChipButton>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function withSettlement(s: TrussSupport, key: 'settlementX' | 'settlementY', value: number): TrussSupport {
  const next = { ...s };
  if (value === 0) delete next[key];
  else next[key] = value;
  return next;
}

// ---------------------------------------------------------------------------

function MemberProperties({
  id,
  editor,
  dispatch,
  results,
}: {
  id: string;
  editor: EditorState;
  dispatch: Props['dispatch'];
  results: ResultIndex | null;
}) {
  const { model } = editor;
  const member = model.members.find((m) => m.id === id);
  if (!member) return null;
  const a = model.nodes.find((n) => n.id === member.nodeI)!;
  const b = model.nodes.find((n) => n.id === member.nodeJ)!;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

  return (
    <>
      <Header title={`Member ${id}`} subtitle={null} onDelete={() => dispatch({ type: 'deleteSelection' })} deleteLabel="Delete member" />

      {results && <MemberResults member={member} results={results} />}

      <Section title="Geometry">
        <div className="flex items-center justify-between py-1">
          <span className="text-muted">Nodes</span>
          <span className="flex items-center gap-1">
            <ChipButton onClick={() => dispatch({ type: 'select', keys: [selKey('node', a.id)] })}>{a.id}</ChipButton>
            <span className="text-faint">→</span>
            <ChipButton onClick={() => dispatch({ type: 'select', keys: [selKey('node', b.id)] })}>{b.id}</ChipButton>
          </span>
        </div>
        <Row label="Length" value={length > 0 ? `${formatNumber(length, 5)} m` : '0 m (invalid)'} mono />
        <Row label="Angle" value={`${formatNumber(angle, 4)}°`} mono />
      </Section>

      <Section title="Section and material">
        <MaterialFields
          values={{ E: member.E, A: member.A, yieldStrength: member.yieldStrength ?? null, material: member.material ?? 'custom' }}
          onPatch={(patch) => dispatch({ type: 'updateMembers', ids: [id], patch })}
        />
        {length > 0 && <Row label="Axial stiffness EA/L" value={`${formatNumber((member.E * member.A) / length / 1e6)} MN/m`} mono />}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function MultiProperties({ editor, dispatch }: { editor: EditorState; dispatch: Props['dispatch'] }) {
  const counts = { node: 0, member: 0, support: 0, load: 0 };
  const memberIds: string[] = [];
  for (const k of editor.selection) {
    const { kind, id } = parseKey(k);
    counts[kind]++;
    if (kind === 'member') memberIds.push(id);
  }
  const members = editor.model.members.filter((m) => memberIds.includes(m.id));
  const common = (f: (m: (typeof members)[number]) => number) => {
    const values = new Set(members.map(f));
    return values.size === 1 ? [...values][0]! : null;
  };
  const E = common((m) => m.E);
  const A = common((m) => m.A);
  const fy = common((m) => m.yieldStrength ?? NaN);
  const materials = new Set(members.map((m) => m.material ?? 'custom'));
  const summary = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([kind, c]) => `${c} ${kind}${c === 1 ? '' : 's'}`)
    .join(', ');

  return (
    <>
      <Header
        title={`${editor.selection.length} items selected`}
        subtitle={summary}
        onDelete={() => dispatch({ type: 'deleteSelection' })}
        deleteLabel="Delete selection"
      />
      {members.length > 0 && (
        <Section title={`Selected members (${members.length})`}>
          <MaterialFields
            values={{
              E,
              A,
              yieldStrength: fy === null || Number.isNaN(fy) ? null : fy,
              material: materials.size === 1 ? [...materials][0]! : null,
            }}
            onPatch={(patch) => dispatch({ type: 'updateMembers', ids: memberIds, patch })}
          />
          <p className="mt-1 text-[12px] text-faint">Changes apply to every selected member.</p>
        </Section>
      )}
      <Section title="Tips">
        <p className="text-[12px] text-faint">Drag any selected item to move the selection. Shift-click toggles items; Delete removes them.</p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

const inputClass =
  'h-7 w-full min-w-0 rounded border border-line-strong bg-bg px-2 font-mono text-[12px] text-fg focus:border-accent focus:outline-none';
const buttonClass =
  'h-7 shrink-0 rounded border border-line-strong px-2.5 text-[12px] text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40';

function AddNodeForm({ editor, dispatch }: { editor: EditorState; dispatch: Props['dispatch'] }) {
  const [x, setX] = useState('0');
  const [y, setY] = useState('0');
  const px = Number(x.replace(',', '.'));
  const py = Number(y.replace(',', '.'));
  const valid = x.trim() !== '' && y.trim() !== '' && Number.isFinite(px) && Number.isFinite(py);
  const taken = valid && editor.model.nodes.some((nd) => nd.x === px && nd.y === py);
  const id = useId();
  return (
    <form
      className="flex items-end gap-1.5 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || taken) return;
        dispatch({ type: 'addNode', node: { id: nextNodeId(editor.model), x: px, y: py }, select: false });
      }}
    >
      <div className="flex-1">
        <label className="text-[11px] text-muted" htmlFor={`${id}-x`}>
          x (m)
        </label>
        <input id={`${id}-x`} inputMode="decimal" value={x} onChange={(e) => setX(e.target.value)} className={inputClass} />
      </div>
      <div className="flex-1">
        <label className="text-[11px] text-muted" htmlFor={`${id}-y`}>
          y (m)
        </label>
        <input id={`${id}-y`} inputMode="decimal" value={y} onChange={(e) => setY(e.target.value)} className={inputClass} />
      </div>
      <button type="submit" disabled={!valid || taken} title={taken ? 'A node already exists there' : undefined} className={buttonClass}>
        Add node
      </button>
    </form>
  );
}

function AddMemberForm({ editor, dispatch }: { editor: EditorState; dispatch: Props['dispatch'] }) {
  const ids = editor.model.nodes.map((nd) => nd.id);
  const [a, setA] = useState(ids[0]!);
  const [b, setB] = useState(ids[1]!);
  // Fall back to the first nodes if a chosen node was deleted.
  const nodeI = ids.includes(a) ? a : ids[0]!;
  const nodeJ = ids.includes(b) ? b : ids[1]!;
  const exists = Boolean(findMemberBetween(editor.model, nodeI, nodeJ));
  const id = useId();
  const select = (value: string, set: (v: string) => void, label: string, suffix: string) => (
    <div className="flex-1">
      <label className="text-[11px] text-muted" htmlFor={`${id}-${suffix}`}>
        {label}
      </label>
      <select id={`${id}-${suffix}`} value={value} onChange={(e) => set(e.target.value)} className={inputClass}>
        {ids.map((nid) => (
          <option key={nid}>{nid}</option>
        ))}
      </select>
    </div>
  );
  return (
    <form
      className="flex items-end gap-1.5 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (nodeI === nodeJ || exists) return;
        dispatch({ type: 'addMember', member: { id: nextMemberId(editor.model), nodeI, nodeJ, ...editor.defaults } });
      }}
    >
      {select(nodeI, setA, 'From', 'i')}
      {select(nodeJ, setB, 'To', 'j')}
      <button
        type="submit"
        disabled={nodeI === nodeJ || exists}
        title={exists ? 'These nodes are already connected' : undefined}
        className={buttonClass}
      >
        Add member
      </button>
    </form>
  );
}

function FindItem({ editor, dispatch }: { editor: EditorState; dispatch: Props['dispatch'] }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label htmlFor={id} className="text-muted">
        Select
      </label>
      <select
        id={id}
        value=""
        onChange={(e) => e.target.value && dispatch({ type: 'select', keys: [e.target.value as SelectionKey] })}
        className={`${inputClass} w-40`}
      >
        <option value="">Choose…</option>
        <optgroup label="Nodes">
          {editor.model.nodes.map((nd) => (
            <option key={nd.id} value={selKey('node', nd.id)}>
              {nd.id} ({formatNumber(nd.x)}, {formatNumber(nd.y)})
            </option>
          ))}
        </optgroup>
        <optgroup label="Members">
          {editor.model.members.map((mm) => (
            <option key={mm.id} value={selKey('member', mm.id)}>
              {mm.id} ({mm.nodeI}–{mm.nodeJ})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

/**
 * Material preset, E, yield strength and area. `null` values are "mixed"
 * (multi-selection). Editing E or σy by hand turns the material into Custom.
 */
function MaterialFields({
  values,
  onPatch,
}: {
  values: { E: number | null; A: number | null; yieldStrength: number | null; material: string | null };
  onPatch: (p: MemberPatch) => void;
}) {
  const preset = getMaterial(values.material ?? undefined);
  const selectId = useId();
  return (
    <>
      <div className="flex items-center justify-between gap-3 py-1">
        <label htmlFor={selectId} className="text-muted">
          Material
        </label>
        <select
          id={selectId}
          value={values.material ?? ''}
          onChange={(e) => {
            const m = getMaterial(e.target.value);
            onPatch(m ? { E: m.E, yieldStrength: m.yieldStrength, material: m.id } : { material: null });
          }}
          className="h-7 w-40 rounded border border-line-strong bg-bg px-1.5 text-[12px] text-fg focus:border-accent focus:outline-none"
        >
          {values.material === null && <option value="">Mixed</option>}
          {MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>
      {preset && <p className="pb-1 text-[11px] text-faint">{preset.source}</p>}
      <NumberField
        label="Elastic modulus E"
        unit="GPa"
        value={values.E === null ? null : fromSI(values.E, 'modulus')}
        validate={positive}
        onCommit={(v) => onPatch({ E: toSI(v, 'modulus'), material: null })}
      />
      <NumberField
        label="Yield strength σy"
        unit="MPa"
        value={values.yieldStrength === null ? null : fromSI(values.yieldStrength, 'stress')}
        validate={positive}
        title="Used for the factor of safety against yielding only"
        onCommit={(v) => onPatch({ yieldStrength: toSI(v, 'stress'), material: null })}
      />
      <NumberField
        label="Area A"
        unit="mm²"
        value={values.A === null ? null : fromSI(values.A, 'area')}
        validate={positive}
        onCommit={(v) => onPatch({ A: toSI(v, 'area') })}
      />
    </>
  );
}

function NodeResults({ id, hasSupport, results }: { id: string; hasSupport: boolean; results: ResultIndex }) {
  const d = results.displacements.get(id);
  if (!d) return null;
  const ux = denoise(d.ux, results.maxDisplacement);
  const uy = denoise(d.uy, results.maxDisplacement);
  const r = results.reactions.get(id);
  return (
    <Section title="Results" tone="results">
      <Row label="Displacement uₓ" value={`${formatNumber(ux * 1e3)} mm`} mono />
      <Row label="Displacement u_y" value={`${formatNumber(uy * 1e3)} mm`} mono />
      <Row label="|u|" value={`${formatNumber(Math.hypot(ux, uy) * 1e3)} mm`} mono />
      {hasSupport && r && (
        <>
          <Row label="Reaction Rₓ" value={`${formatNumber(denoise(r.rx, results.forceScale) / 1e3)} kN`} mono />
          <Row label="Reaction R_y" value={`${formatNumber(denoise(r.ry, results.forceScale) / 1e3)} kN`} mono />
        </>
      )}
    </Section>
  );
}

function MemberResults({ member, results }: { member: TrussMember; results: ResultIndex }) {
  const r = results.members.get(member.id);
  if (!r) return null;
  const N = denoise(r.axialForce, results.forceScale);
  const zero = r.state === 'zero';
  const fos = yieldFactorOfSafety(member, r);
  const u = utilization(member, r);
  const stateLabel = zero ? 'zero-force' : r.state;
  return (
    <Section title="Results" tone="results">
      <Row label="Axial force N" value={`${formatNumber(N / 1e3)} kN`} mono />
      <Row label="State" value={stateLabel} />
      <Row label="Stress σ" value={`${formatNumber(zero ? 0 : r.stress / 1e6)} MPa`} mono />
      <Row label="Strain ε" value={`${formatNumber(zero ? 0 : r.strain * 1e6)} µε`} mono />
      <Row label="Elongation ΔL" value={`${formatNumber(zero ? 0 : r.elongation * 1e3)} mm`} mono />
      <Row
        label="FoS (yield)"
        value={fos === null ? 'needs σy' : fos === Infinity ? '∞' : formatNumber(fos, 3)}
        mono
        tone={fos !== null && fos < 1 ? 'bad' : undefined}
      />
      {u !== null && <Row label="Utilisation |σ|/σy" value={`${formatNumber(u * 100, 3)} %`} mono tone={u > 1 ? 'bad' : undefined} />}
      {r.state === 'compression' && (
        <p className="mt-1 text-[12px] text-deformed">Compression member: buckling is not checked and may govern well below yield.</p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function Header({
  title,
  subtitle,
  onDelete,
  deleteLabel,
}: {
  title: string;
  subtitle: string | null;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-3">
      <div className="min-w-0">
        <h3 className="truncate font-mono text-[13px] font-medium text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onDelete}
        title={`${deleteLabel} (Delete)`}
        aria-label={deleteLabel}
        className="grid size-7 shrink-0 place-items-center rounded text-faint hover:bg-raised hover:text-compression"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function Section({
  title,
  highlight,
  tone,
  children,
}: {
  title: string;
  highlight?: boolean;
  tone?: 'results';
  children: React.ReactNode;
}) {
  const bg = highlight ? 'bg-accent/[0.06]' : tone === 'results' ? 'bg-reaction/[0.05]' : '';
  const heading = highlight ? 'text-accent' : tone === 'results' ? 'text-reaction' : 'text-faint';
  return (
    <section className={`border-b border-line px-3 py-3 ${bg}`}>
      <h3 className={`mb-2 font-mono text-[10.5px] uppercase tracking-wider ${heading}`}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'bad' | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted">{label}</span>
      <span className={`text-right ${tone === 'bad' ? 'text-compression' : 'text-fg'} ${mono ? 'font-mono text-[12px] tabular' : ''}`}>{value}</span>
    </div>
  );
}

function Toggle({ label, shortcut, checked, onChange }: { label: string; shortcut?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1">
      <span className="text-muted">
        {label}
        {shortcut && <span className="ml-1.5 font-mono text-[10.5px] text-faint">{shortcut}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--color-accent)]" />
    </label>
  );
}

function ChipButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[11.5px] text-muted hover:border-accent/60 hover:text-fg"
    >
      {children}
    </button>
  );
}
