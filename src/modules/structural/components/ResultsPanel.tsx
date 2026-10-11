import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Download, Info, OctagonAlert } from 'lucide-react';
import { formatNumber } from '../../../utils/units';
import type { Diagnostic, TrussModel } from '../models/truss';
import { getMaterial } from '../models/materials';
import { selKey, supportType, type SelectionKey } from '../editor/editorState';
import type { AnalysisRun, ResultIndex } from '../results/analysisRun';
import { denoise, yieldFactorOfSafety } from '../results/resultsView';

export type ResultsTab = 'diagnostics' | 'displacements' | 'forces' | 'reactions';

const TABS: { id: ResultsTab; label: string }[] = [
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'displacements', label: 'Displacements' },
  { id: 'forces', label: 'Member forces' },
  { id: 'reactions', label: 'Reactions' },
];

interface Props {
  run: AnalysisRun | null;
  index: ResultIndex | null;
  stale: boolean;
  tab: ResultsTab;
  onTabChange: (t: ResultsTab) => void;
  selection: readonly SelectionKey[];
  onSelect: (keys: SelectionKey[]) => void;
  /** Available only while fresh, successful results are shown. */
  onExportCsv: ((tab: Exclude<ResultsTab, 'diagnostics'>) => void) | null;
}

export function ResultsPanel({ run, index, stale, tab, onTabChange, selection, onSelect, onExportCsv }: Props) {
  const selected = useMemo(() => new Set(selection), [selection]);

  let content: React.ReactNode;
  if (!run || !index) content = <Empty title="No analysis results." detail="Build a model, then press Run analysis (R)." />;
  else if (tab === 'diagnostics') content = <DiagnosticsList diagnostics={run.result.diagnostics} onSelect={onSelect} />;
  else if (index.status !== 'solved')
    content = (
      <Empty
        title={index.status === 'unstable' ? 'The structure is unstable, so there are no results.' : 'The model has errors, so there are no results.'}
        detail="See the Diagnostics tab."
      />
    );
  else if (tab === 'displacements') content = <DisplacementTable run={run} index={index} selected={selected} onSelect={onSelect} />;
  else if (tab === 'forces') content = <ForceTable run={run} index={index} selected={selected} onSelect={onSelect} />;
  else content = <ReactionTable run={run} index={index} selected={selected} onSelect={onSelect} />;

  return (
    <section aria-label="Results" className="flex h-56 shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex h-9 shrink-0 items-stretch border-b border-line px-2">
        <div role="tablist" aria-label="Result views" className="flex items-stretch gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="results-tabpanel"
              onClick={() => onTabChange(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-2.5 text-xs font-medium ${
                tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {t.label}
              {t.id === 'diagnostics' && run && <DiagnosticCount diagnostics={run.result.diagnostics} />}
            </button>
          ))}
        </div>
        {run && index && <StatusLine run={run} index={index} stale={stale} />}
        {onExportCsv && tab !== 'diagnostics' && (
          <button
            type="button"
            onClick={() => onExportCsv(tab)}
            title="Download this table as CSV"
            className="my-1.5 ml-3 inline-flex shrink-0 items-center gap-1 rounded border border-line-strong px-2 text-[11.5px] text-muted hover:bg-raised hover:text-fg"
          >
            <Download className="size-3" aria-hidden="true" /> CSV
          </button>
        )}
      </div>
      <div
        role="tabpanel"
        id="results-tabpanel"
        aria-labelledby={`tab-${tab}`}
        className={`min-h-0 flex-1 overflow-auto ${stale ? 'opacity-50' : ''}`}
      >
        {content}
      </div>
    </section>
  );
}

function StatusLine({ run, index, stale }: { run: AnalysisRun; index: ResultIndex; stale: boolean }) {
  const r = run.result;
  let text: string;
  let tone: string;
  if (r.status === 'solved') {
    text = `Solved · ${r.stats.dofs} DOF (${r.stats.freeDofs} free) · residual ${r.equilibrium.relativeResidual.toExponential(1)}`;
    tone = 'text-reaction';
  } else if (r.status === 'unstable') {
    text = `Unstable · ${index.mechanismModes.length} mechanism mode${index.mechanismModes.length === 1 ? '' : 's'}`;
    tone = 'text-compression';
  } else {
    const n = r.diagnostics.filter((d) => d.severity === 'error').length;
    text = `${n} input error${n === 1 ? '' : 's'}`;
    tone = 'text-compression';
  }
  return (
    <div className="ml-auto hidden shrink-0 items-center gap-2 pl-3 font-mono text-[11px] md:flex">
      {stale && <span className="rounded border border-deformed/40 px-1.5 py-0.5 text-deformed">out of date</span>}
      <span className={stale ? 'text-faint' : tone}>{text}</span>
    </div>
  );
}

function DiagnosticCount({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  if (!errors && !warnings) return null;
  return (
    <span className={`ml-1.5 rounded px-1 font-mono text-[10px] ${errors ? 'bg-compression/20 text-compression' : 'bg-deformed/20 text-deformed'}`}>
      {errors || warnings}
    </span>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <div>
        <p className="text-sm text-muted">{title}</p>
        <p className="mt-1 text-[13px] text-faint">{detail}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

function DiagnosticsList({ diagnostics, onSelect }: { diagnostics: readonly Diagnostic[]; onSelect: (k: SelectionKey[]) => void }) {
  const sorted = [...diagnostics].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return (
    <ul className="divide-y divide-line text-[13px]">
      {sorted.map((d, i) => {
        const keys = [...(d.nodeIds ?? []).map((id) => selKey('node', id)), ...(d.memberIds ?? []).map((id) => selKey('member', id))];
        const Icon = d.severity === 'error' ? OctagonAlert : d.severity === 'warning' ? AlertTriangle : Info;
        const color = d.severity === 'error' ? 'text-compression' : d.severity === 'warning' ? 'text-deformed' : 'text-faint';
        return (
          <li key={i} className="flex items-start gap-2.5 px-3 py-2">
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${color}`} aria-label={d.severity} />
            <div className="min-w-0 flex-1">
              <p className="text-fg/90">{d.message}</p>
              {keys.length > 0 && (
                <button type="button" onClick={() => onSelect(keys)} className="mt-0.5 text-[12px] text-accent hover:text-accent-strong">
                  Select {keys.length === 1 ? 'item' : `${keys.length} items`}
                </button>
              )}
            </div>
            <span className="shrink-0 font-mono text-[10.5px] text-faint">{d.code}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------

interface Column<T> {
  key: string;
  label: React.ReactNode;
  title?: string;
  numeric?: boolean;
  sort?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
}

function DataTable<T>({
  rows,
  columns,
  rowKey,
  selected,
  onRowClick,
  footer,
}: {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => SelectionKey;
  selected: ReadonlySet<SelectionKey>;
  onRowClick: (row: T) => void;
  footer?: React.ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir;
    });
  }, [rows, columns, sort]);

  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-line">
          {columns.map((c) => {
            const active = sort?.key === c.key;
            return (
              <th
                key={c.key}
                scope="col"
                title={c.title}
                aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                className={`px-3 py-1.5 font-mono text-[10.5px] font-normal uppercase tracking-wider text-faint ${c.numeric ? 'text-right' : 'text-left'}`}
              >
                {c.sort ? (
                  <button
                    type="button"
                    onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.numeric ? -1 : 1 })}
                    className={`inline-flex items-center gap-0.5 uppercase hover:text-fg ${active ? 'text-fg' : ''}`}
                  >
                    {c.label}
                    {active && (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const k = rowKey(row);
          return (
            <tr
              key={k}
              onClick={() => onRowClick(row)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              aria-selected={selected.has(k)}
              className={`cursor-pointer border-b border-line/60 ${selected.has(k) ? 'bg-accent/10' : 'hover:bg-raised/60'}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-1 ${c.numeric ? 'text-right font-mono tabular' : ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      {footer}
    </table>
  );
}

const num = (v: number, digits = 4) => formatNumber(v, digits);

type TableProps = { run: AnalysisRun; index: ResultIndex; selected: ReadonlySet<SelectionKey>; onSelect: (k: SelectionKey[]) => void };

function DisplacementTable({ run, index, selected, onSelect }: TableProps) {
  const scale = index.maxDisplacement;
  const rows = run.model.nodes.map((n) => {
    const d = index.displacements.get(n.id)!;
    const ux = denoise(d.ux, scale);
    const uy = denoise(d.uy, scale);
    return { id: n.id, ux, uy, mag: Math.hypot(ux, uy) };
  });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'id', label: 'Node', sort: (r) => r.id, render: (r) => <span className="font-mono">{r.id}</span> },
    { key: 'ux', label: 'uₓ (mm)', numeric: true, sort: (r) => r.ux, render: (r) => num(r.ux * 1e3) },
    { key: 'uy', label: 'u_y (mm)', numeric: true, sort: (r) => r.uy, render: (r) => num(r.uy * 1e3) },
    {
      key: 'mag',
      label: '|u| (mm)',
      numeric: true,
      sort: (r) => r.mag,
      render: (r) => <span className={r.mag > 0 && r.mag === scale ? 'text-deformed' : ''}>{num(r.mag * 1e3)}</span>,
    },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(r) => selKey('node', r.id)} selected={selected} onRowClick={(r) => onSelect([selKey('node', r.id)])} />;
}

function ForceTable({ run, index, selected, onSelect }: TableProps) {
  const rows = run.model.members.map((m) => {
    const r = index.members.get(m.id)!;
    const N = denoise(r.axialForce, index.forceScale);
    return {
      id: m.id,
      nodes: `${m.nodeI}–${m.nodeJ}`,
      length: r.length,
      N,
      state: r.state,
      stress: r.state === 'zero' ? 0 : r.stress,
      fos: yieldFactorOfSafety(m, r),
      material: getMaterial(m.material)?.name ?? (m.yieldStrength !== undefined ? 'Custom' : 'No yield strength'),
    };
  });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'id', label: 'Member', sort: (r) => r.id, render: (r) => <span className="font-mono">{r.id}</span> },
    { key: 'nodes', label: 'Nodes', render: (r) => <span className="font-mono text-muted">{r.nodes}</span> },
    { key: 'L', label: 'L (m)', numeric: true, sort: (r) => r.length, render: (r) => num(r.length) },
    {
      key: 'N',
      label: 'N (kN)',
      title: 'Axial force, positive in tension',
      numeric: true,
      sort: (r) => r.N,
      render: (r) => <span className={r.state === 'tension' ? 'text-tension' : r.state === 'compression' ? 'text-compression' : 'text-faint'}>{num(r.N / 1e3)}</span>,
    },
    {
      key: 'state',
      label: 'State',
      sort: (r) => r.state,
      render: (r) => <span className="text-muted">{r.state === 'zero' ? 'zero-force' : r.state}</span>,
    },
    { key: 'sigma', label: 'σ (MPa)', numeric: true, sort: (r) => r.stress, render: (r) => num(r.stress / 1e6) },
    {
      key: 'fos',
      label: 'FoS yield',
      title: 'Factor of safety against yielding, σy / |σ|. Buckling is not checked.',
      numeric: true,
      sort: (r) => (r.fos === null ? Number.MAX_VALUE : r.fos),
      render: (r) =>
        r.fos === null ? (
          <span className="text-faint" title={r.material}>
            —
          </span>
        ) : (
          <span className={r.fos < 1 ? 'text-compression' : ''} title={r.state === 'compression' ? 'Yield only; buckling not checked' : r.material}>
            {r.fos === Infinity ? '∞' : num(r.fos, 3)}
            {r.state === 'compression' ? '*' : ''}
          </span>
        ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => selKey('member', r.id)}
      selected={selected}
      onRowClick={(r) => onSelect([selKey('member', r.id)])}
      footer={
        <tfoot>
          <tr>
            <td colSpan={columns.length} className="px-3 py-1.5 text-[11.5px] text-faint">
              * Compression member: yield check only. Buckling can govern at much lower loads and is not checked.
            </td>
          </tr>
        </tfoot>
      }
    />
  );
}

function ReactionTable({ run, index, selected, onSelect }: TableProps) {
  const model: TrussModel = run.model;
  const rows = model.supports.map((s) => {
    const r = index.reactions.get(s.nodeId)!;
    const type = supportType(s);
    return {
      id: s.nodeId,
      type: type === 'pin' ? 'Pin' : type === 'rollerY' ? 'Roller (y)' : type === 'rollerX' ? 'Roller (x)' : '—',
      rx: denoise(r.rx, index.forceScale),
      ry: denoise(r.ry, index.forceScale),
      restrainX: s.restrainX,
      restrainY: s.restrainY,
    };
  });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'id', label: 'Node', sort: (r) => r.id, render: (r) => <span className="font-mono">{r.id}</span> },
    { key: 'type', label: 'Support', render: (r) => <span className="text-muted">{r.type}</span> },
    { key: 'rx', label: 'Rₓ (kN)', numeric: true, sort: (r) => r.rx, render: (r) => (r.restrainX ? num(r.rx / 1e3) : <span className="text-faint">free</span>) },
    { key: 'ry', label: 'R_y (kN)', numeric: true, sort: (r) => r.ry, render: (r) => (r.restrainY ? num(r.ry / 1e3) : <span className="text-faint">free</span>) },
  ];
  const sumRx = rows.reduce((s, r) => s + r.rx, 0);
  const sumRy = rows.reduce((s, r) => s + r.ry, 0);
  const sumFx = model.loads.reduce((s, l) => s + l.fx, 0);
  const sumFy = model.loads.reduce((s, l) => s + l.fy, 0);
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => selKey('support', r.id)}
      selected={selected}
      onRowClick={(r) => onSelect([selKey('support', r.id)])}
      footer={
        <tfoot className="font-mono text-[11.5px] text-faint">
          <tr>
            <td colSpan={2} className="px-3 pt-1.5">
              Σ reactions
            </td>
            <td className="px-3 pt-1.5 text-right tabular">{num(denoise(sumRx, index.forceScale) / 1e3)}</td>
            <td className="px-3 pt-1.5 text-right tabular">{num(denoise(sumRy, index.forceScale) / 1e3)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="px-3 pb-1.5">
              Σ applied loads
            </td>
            <td className="px-3 pb-1.5 text-right tabular">{num(sumFx / 1e3)}</td>
            <td className="px-3 pb-1.5 text-right tabular">{num(sumFy / 1e3)}</td>
          </tr>
        </tfoot>
      }
    />
  );
}
