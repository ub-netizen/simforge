import type { ModuleIcon as IconName } from '../modules/registry';

/** Small technical line drawings used in the simulator library. */
export function ModuleIcon({ name, className = 'h-10 w-16' }: { name: IconName; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true">
      {name === 'truss' && (
        <g {...common}>
          <path d="M4 32 H60 M14 12 H50 M4 32 L14 12 L24 32 L32 12 L40 32 L50 12 L60 32" />
          <path d="M24 32 V32 M32 12 V12" />
          <path d="M4 32 l-3 5 h6 Z M60 32 l-3 5 h6 Z" />
        </g>
      )}
      {name === 'beam' && (
        <g {...common}>
          <rect x="4" y="17" width="56" height="5" />
          <path d="M8 22 l-3 5 h6 Z M56 22 l-3 5 h6 Z" />
          <path d="M32 4 V15 M29 11 L32 15 L35 11" />
          <path d="M6 30 Q32 40 58 30" strokeDasharray="2 2.5" />
        </g>
      )}
      {name === 'flow' && (
        <g {...common}>
          <circle cx="30" cy="20" r="6" />
          <path d="M2 8 C18 8 22 12 30 12 C40 12 46 6 62 8" />
          <path d="M2 20 H22 M38 20 C46 20 50 16 62 18" />
          <path d="M2 32 C18 32 22 28 30 28 C40 28 46 34 62 32" />
        </g>
      )}
      {name === 'linkage' && (
        <g {...common}>
          <path d="M10 32 L18 10 L46 14 L54 32" />
          <circle cx="10" cy="32" r="2.5" />
          <circle cx="18" cy="10" r="2" />
          <circle cx="46" cy="14" r="2" />
          <circle cx="54" cy="32" r="2.5" />
          <path d="M4 36 H16 M48 36 H60" />
        </g>
      )}
      {name === 'airfoil' && (
        <g {...common}>
          <path d="M6 22 C10 12 26 10 40 13 C50 15 56 19 60 22 C50 23 30 26 18 26 C10 26 6 24 6 22 Z" />
          <path d="M2 8 C20 2 40 4 62 10 M2 34 C22 36 44 34 62 30" strokeDasharray="2 2.5" />
        </g>
      )}
    </svg>
  );
}
