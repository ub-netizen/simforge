import { useEffect, useId, useRef, useState } from 'react';
import { clean } from '../utils/units';

interface Props {
  label: string;
  /** Value in display units; null shows a "mixed" placeholder for multi-selections. */
  value: number | null;
  unit: string;
  onCommit: (value: number) => void;
  /** Returns an error message for unacceptable values. */
  validate?: (value: number) => string | null;
  title?: string;
}

export const positive = (v: number) => (v > 0 ? null : 'Must be greater than zero');

/**
 * Numeric input that commits on Enter or blur and reverts on Escape, so each
 * edit is a single undo step. Invalid input is flagged and never committed.
 */
export function NumberField({ label, value, unit, onCommit, validate, title }: Props) {
  const id = useId();
  const shown = value === null ? '' : String(clean(value));
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);

  // Follow external changes (undo, dragging, selection) while not being edited.
  useEffect(() => {
    if (!focused) setDraft(shown);
  }, [shown, focused]);

  const parsed = draft.trim() === '' ? NaN : Number(draft.replace(',', '.'));
  const error = draft.trim() === '' ? (value === null ? null : 'Enter a number') : !Number.isFinite(parsed) ? 'Not a number' : (validate?.(parsed) ?? null);

  const commit = () => {
    // Compare text, not numbers: an untouched field must never create an edit.
    if (error || draft.trim() === '' || draft === shown) {
      setDraft(shown);
      return;
    }
    onCommit(parsed);
  };

  return (
    <div className="py-1" title={title}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <div
          className={`flex h-7 w-32 items-center rounded border bg-bg focus-within:border-accent ${error ? 'border-compression' : 'border-line-strong'}`}
        >
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            placeholder={value === null ? 'mixed' : undefined}
            aria-invalid={Boolean(error)}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              setFocused(true);
              e.target.select();
            }}
            onBlur={() => {
              setFocused(false);
              if (cancelled.current) cancelled.current = false;
              else commit();
            }}
            onKeyDown={(e) => {
              // Enter commits through the blur handler, so the edit is applied exactly once.
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') {
                cancelled.current = true;
                setDraft(shown);
                e.currentTarget.blur();
              }
            }}
            className="w-full min-w-0 bg-transparent px-2 text-right font-mono text-[12px] text-fg tabular outline-none placeholder:text-faint"
          />
          <span className="shrink-0 pr-2 font-mono text-[11px] text-faint">{unit}</span>
        </div>
      </div>
      {error && focused && <p className="mt-1 text-right text-[11px] text-compression">{error}</p>}
    </div>
  );
}
