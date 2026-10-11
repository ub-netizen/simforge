import type { ModuleStatus } from '../modules/registry';

const STYLES: Record<ModuleStatus, { label: string; className: string }> = {
  available: { label: 'Available', className: 'border-reaction/40 text-reaction' },
  'in-development': { label: 'In development', className: 'border-accent/40 text-accent' },
  planned: { label: 'Planned', className: 'border-line-strong text-muted' },
};

export function StatusBadge({ status }: { status: ModuleStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider ${s.className}`}
    >
      {s.label}
    </span>
  );
}
