import { APP_VERSION, GITHUB_REPO_URL } from '../../app/config';
import { LogoMark } from '../Logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="size-4 text-faint" />
          <span>SimForge</span>
          <span className="font-mono text-xs text-faint">v{APP_VERSION}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>MIT licensed</span>
          <span>Runs entirely in your browser</span>
          {GITHUB_REPO_URL && (
            <a href={GITHUB_REPO_URL} className="hover:text-fg">
              Source on GitHub
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
