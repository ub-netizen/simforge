import { Link } from 'react-router';
import { GitFork } from 'lucide-react';
import { Logo } from '../Logo';
import { GITHUB_REPO_URL } from '../../app/config';

const NAV = [
  { href: '#library', label: 'Simulators' },
  { href: '#method', label: 'Method' },
  { href: '#examples', label: 'Examples' },
  { href: '#open-source', label: 'Open source' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-muted md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={scrollTo(n.href)} className="hover:text-fg">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {GITHUB_REPO_URL && (
            <a
              href={GITHUB_REPO_URL}
              className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-panel-2 hover:text-fg sm:flex"
            >
              <GitFork className="size-4" aria-hidden="true" />
              GitHub
            </a>
          )}
          <Link
            to="/structural/truss"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-strong"
          >
            Launch simulator
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The app uses hash routing (#/path) for GitHub Pages, so plain in-page
 * anchors (#section) would be read as routes. Scroll to sections manually.
 */
export function scrollTo(hash: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById(hash.slice(1));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Move keyboard focus with the scroll so the next Tab continues from the section.
    target?.focus({ preventScroll: true });
  };
}
