import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface MenuItem {
  label: string;
  description?: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separator?: boolean;
}

/** Accessible dropdown menu: keyboard navigation, closes on outside click or Escape. */
export function Menu({ label, icon, items, wide }: { label: string; icon?: React.ReactNode; items: readonly MenuItem[]; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    // Focus the first enabled item for keyboard users.
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not([disabled])')?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const entries = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not([disabled])') ?? [])];
    const i = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      entries[(i + 1) % entries.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      entries[(i - 1 + entries.length) % entries.length]?.focus();
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-8 items-center gap-1.5 rounded px-2 text-sm hover:bg-raised hover:text-fg ${open ? 'bg-raised text-fg' : 'text-muted'}`}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className="size-3.5 text-faint" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={`absolute left-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line-strong bg-panel-2 py-1 shadow-xl shadow-black/40 ${wide ? 'w-80' : 'w-60'}`}
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separator && <div className="my-1 h-px bg-line" role="separator" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="flex w-full items-start justify-between gap-3 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-raised focus:bg-raised focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {item.description && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{item.description}</span>}
                </span>
                {item.shortcut && <span className="shrink-0 font-mono text-[11px] text-faint">{item.shortcut}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
