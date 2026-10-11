import { TOOLS, type ToolDef, type ToolId } from './tools';

interface Props {
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
}

export function WorkspaceToolbar({ tool, onToolChange }: Props) {
  const navigation = TOOLS.filter((t) => t.id === 'select' || t.id === 'pan');
  const modelling = TOOLS.filter((t) => t.id !== 'select' && t.id !== 'pan');

  return (
    <nav aria-label="Tools" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
      {navigation.map((t) => (
        <ToolButton key={t.id} def={t} active={tool === t.id} onSelect={() => onToolChange(t.id)} />
      ))}
      <div className="my-1 h-px w-6 bg-line" aria-hidden="true" />
      {modelling.map((t) => (
        <ToolButton key={t.id} def={t} active={tool === t.id} onSelect={() => onToolChange(t.id)} />
      ))}
    </nav>
  );
}

function ToolButton({ def, active, onSelect }: { def: ToolDef; active: boolean; onSelect: () => void }) {
  const Icon = def.icon;
  const label = `${def.label} (${def.shortcut})`;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onSelect}
      className={`grid size-9 place-items-center rounded-md transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raised hover:text-fg'
      }`}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
