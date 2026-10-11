import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { SiteHeader, scrollTo } from '../../components/layout/SiteHeader';
import { SiteFooter } from '../../components/layout/SiteFooter';
import { ModuleIcon } from '../../components/ModuleIcon';
import { StatusBadge } from '../../components/StatusBadge';
import { TrussSketch } from '../../modules/structural/components/TrussSketch';
import { EXAMPLES, getExample } from '../../modules/structural/examples/examples';
import { MODULES, type Discipline } from '../../modules/registry';
import { GITHUB_REPO_URL } from '../config';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        onClick={scrollTo('#main')}
        className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Principles />
        <Library />
        <Method />
        <Examples />
        <OpenSource />
      </main>
      <SiteFooter />
    </div>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}

const HERO = getExample('pratt')!;

function Hero() {
  const dofs = 2 * HERO.model.nodes.length;
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--color-grid-minor) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at 70% 40%, black 30%, transparent 75%)',
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded border border-line bg-panel px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            v0.1 in development · 2D truss analysis
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Mechanical engineering simulation, in your browser.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            SimForge is an open-source engineering playground built on real numerical methods with documented
            assumptions. No servers, accounts or API keys: every calculation runs on your machine.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/structural/truss"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 font-medium text-accent-ink hover:bg-accent-strong"
            >
              Launch simulator
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#method"
              onClick={scrollTo('#method')}
              className="rounded-md border border-line-strong px-4 py-2.5 text-fg hover:bg-panel-2"
            >
              How the solver works
            </a>
          </div>
        </div>

        <figure className="rounded-lg border border-line bg-panel/80 p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-faint">
            <span>MODEL · PRATT TRUSS</span>
            <span>SI · N, m, Pa</span>
          </div>
          <TrussSketch
            model={HERO.model}
            labels
            spanLabel="6 × 3.0 m = 18.0 m"
            title={`Pratt truss geometry: ${HERO.model.nodes.length} nodes, ${HERO.model.members.length} members, pinned and roller supports, three point loads`}
            className="w-full text-fg/85"
          />
          <figcaption className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 font-mono text-[11px] text-muted">
            <span>
              nodes <span className="text-fg">{HERO.model.nodes.length}</span>
            </span>
            <span>
              members <span className="text-fg">{HERO.model.members.length}</span>
            </span>
            <span>
              dof <span className="text-fg">{dofs}</span>
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

const PRINCIPLES = [
  { title: 'Runs locally', body: 'Static site, client-side solvers. No backend, no accounts, no data leaves your browser.' },
  { title: 'Real methods', body: 'Established numerical methods such as the direct stiffness method, not curve-fitted approximations.' },
  { title: 'Validated', body: 'Each solver ships with automated tests against independently derived analytical solutions.' },
  { title: 'Transparent', body: 'Equations, assumptions and limitations are documented next to the results they produce.' },
];

function Principles() {
  return (
    <section className="border-b border-line bg-panel/40">
      <div className="mx-auto grid max-w-6xl gap-px px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="py-6 lg:px-5 lg:first:pl-0">
            <h3 className="text-sm font-semibold">{p.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const DISCIPLINES: Discipline[] = ['Structural', 'Fluids', 'Mechanisms', 'Aerodynamics'];

function Library() {
  return (
    <section id="library" tabIndex={-1} className="scroll-mt-16 outline-none border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Simulation library" title="One workspace per physical problem">
          The first release focuses on a single simulator done properly. Other modules are on the roadmap and are
          labelled as planned until they are implemented and validated.
        </SectionHeading>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DISCIPLINES.flatMap((d) => MODULES.filter((m) => m.discipline === d)).map((m) => {
            const active = m.status !== 'planned' && m.path;
            const body = (
              <>
                <div className="flex items-start justify-between">
                  <ModuleIcon name={m.icon} className={`h-10 w-16 ${active ? 'text-fg' : 'text-faint'}`} />
                  <StatusBadge status={m.status} />
                </div>
                <p className="mt-5 font-mono text-[11px] uppercase tracking-wider text-faint">{m.discipline}</p>
                <h3 className={`mt-1 font-semibold ${active ? 'text-fg' : 'text-muted'}`}>{m.name}</h3>
                <p className="mt-2 text-sm text-muted">{m.summary}</p>
                <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] text-faint">{m.method}</p>
              </>
            );
            return active ? (
              <Link
                key={m.id}
                to={m.path!}
                className="group rounded-lg border border-line-strong bg-panel p-5 hover:border-accent/60 hover:bg-panel-2"
              >
                {body}
                <span className="mt-3 inline-flex items-center gap-1 text-sm text-accent">
                  Open workspace <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ) : (
              <div key={m.id} className="rounded-lg border border-dashed border-line p-5">
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Element stiffness',
    eq: 'kₑ = (EA/L) [ C  −C ; −C  C ]',
    note: 'C = [ c²  cs ; cs  s² ], with c, s the member direction cosines.',
  },
  { n: '02', title: 'Assembly', eq: 'K = Σ Aₑᵀ kₑ Aₑ', note: 'Element matrices are scattered into the global 2n × 2n system.' },
  {
    n: '03',
    title: 'Boundary conditions',
    eq: 'K_ff u_f = F_f − K_fs u_s',
    note: 'The system is partitioned into free and supported degrees of freedom.',
  },
  {
    n: '04',
    title: 'Solve',
    eq: 'K_ff = L D Lᵀ',
    note: 'Cholesky (LDLᵀ) factorisation, then substitution. K is never inverted; a zero pivot identifies a mechanism.',
  },
  {
    n: '05',
    title: 'Post-process',
    eq: 'N = (EA/L) [−c −s c s] uₑ',
    note: 'Axial forces, stresses σ = N/A, reactions R = K_sf u_f + K_ss u_s − F_s.',
  },
];

const LIMITATIONS = [
  'Pin-jointed members carry axial force only: no bending or shear.',
  'Linear elastic material and small displacements.',
  'No buckling, fatigue, plasticity or dynamic effects. Check compression members for buckling separately.',
  'Loads are applied at nodes only.',
];

function Method() {
  return (
    <section id="method" tabIndex={-1} className="scroll-mt-16 outline-none border-b border-line bg-panel/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Methodology" title="Direct stiffness method for plane trusses">
          The truss solver assembles and solves K u = F in SI units, directly in your browser. It is checked by
          automated tests against hand-derived solutions.
        </SectionHeading>

        <ol className="mt-10 divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="grid gap-2 px-5 py-4 md:grid-cols-[2.5rem_11rem_minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:gap-6"
            >
              <p className="font-mono text-xs text-accent">{s.n}</p>
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <p className="overflow-x-auto whitespace-nowrap rounded bg-bg px-3 py-2 font-mono text-[13px] text-fg/90">
                {s.eq}
              </p>
              <p className="text-[13px] text-muted">{s.note}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-lg border border-line p-5">
          <h3 className="text-sm font-semibold">Assumptions and limitations</h3>
          <ul className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
            {LIMITATIONS.map((l) => (
              <li key={l} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                {l}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const FEATURED = ['warren', 'pratt', 'howe', 'cantilever'].map((id) => getExample(id)!);

function Examples() {
  return (
    <section id="examples" tabIndex={-1} className="scroll-mt-16 outline-none border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Example projects" title="Reference structures">
          Classic trusses you can open in the workspace with one click. Each one is checked by the test suite against a
          hand-derived solution.
        </SectionHeading>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED.map((e) => {
            const m = e.model.members.length;
            const r = e.model.supports.reduce((s, x) => s + Number(x.restrainX) + Number(x.restrainY), 0);
            const degree = m + r - 2 * e.model.nodes.length;
            return (
              <Link
                key={e.id}
                to={`/structural/truss?example=${e.id}`}
                className="group flex flex-col rounded-lg border border-line bg-panel p-4 hover:border-accent/60 hover:bg-panel-2"
              >
                <div className="aspect-[4/3] rounded bg-bg p-3">
                  <TrussSketch model={e.model} title={`${e.title} geometry`} className="size-full text-fg/80" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{e.title}</h3>
                <p className="mt-1 flex-1 text-[13px] text-muted">{e.summary}</p>
                <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-faint">
                  <span>
                    {e.model.nodes.length} nodes · {m} members · {degree === 0 ? 'determinate' : `indeterminate (${degree})`}
                  </span>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-sm text-accent">
                  Open example <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-faint">
          {EXAMPLES.length - FEATURED.length} more, including statically indeterminate and support-settlement cases, are
          in the workspace&apos;s Examples menu.
        </p>
      </div>
    </section>
  );
}

function OpenSource() {
  return (
    <section id="open-source" tabIndex={-1} className="scroll-mt-16">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <SectionHeading eyebrow="Open source" title="Built in the open, for engineering students">
          SimForge is MIT licensed. Contributions are welcome: solver validation cases, new simulators, documentation,
          and interface improvements.
        </SectionHeading>
        <div className="rounded-lg border border-line bg-panel p-5 font-mono text-[13px]">
          <p className="text-faint"># run locally</p>
          <p className="mt-1">
            <span className="text-accent">$</span> git clone {GITHUB_REPO_URL ?? '<repository-url>'}
          </p>
          <p>
            <span className="text-accent">$</span> cd simforge && npm install
          </p>
          <p>
            <span className="text-accent">$</span> npm run dev
          </p>
          <div className="mt-5 border-t border-line pt-4 font-sans text-sm">
            {GITHUB_REPO_URL ? (
              <a href={GITHUB_REPO_URL} className="inline-flex items-center gap-1 text-accent hover:text-accent-strong">
                View the repository on GitHub <ArrowRight className="size-3.5" />
              </a>
            ) : (
              <p className="text-muted">The public repository link will appear here once it is published.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
