import { Link } from 'react-router';

export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M5 24 L16 7 L27 24 Z" />
        <path d="M10.5 15.5 L16 24 L21.5 15.5" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-fg hover:text-white" aria-label="SimForge home">
      <LogoMark className="size-6 text-accent" />
      <span className="text-[15px] font-semibold tracking-tight">SimForge</span>
    </Link>
  );
}
