import { Link } from 'react-router';
import { LogoMark } from '../../components/Logo';

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark className="size-10 text-faint" />
      <p className="font-mono text-sm text-faint">404</p>
      <h1 className="text-xl font-semibold">This page does not exist.</h1>
      <Link to="/" className="text-accent hover:text-accent-strong">
        Back to SimForge
      </Link>
    </main>
  );
}
