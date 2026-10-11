import { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ToastMessage {
  /** Changes for every new message, so repeated identical messages still restart the timer. */
  id: number;
  tone: 'info' | 'error';
  message: string;
  details?: readonly string[];
}

/** Short status message. Errors with details stay until dismissed; others fade after a few seconds. */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast || toast.details?.length) return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const error = toast.tone === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`pointer-events-auto absolute bottom-3 left-1/2 z-40 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-md border bg-panel-2 px-3 py-2.5 text-[13px] shadow-xl shadow-black/40 ${
        error ? 'border-compression/50' : 'border-line-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={error ? 'text-compression' : 'text-fg'}>{toast.message}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-faint hover:text-fg">
          <X className="size-3.5" />
        </button>
      </div>
      {toast.details && toast.details.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-muted">
          {toast.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
