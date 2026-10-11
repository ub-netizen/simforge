import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, BookOpen, FileText, PanelBottom, PanelRight, Play, Redo2, Undo2 } from 'lucide-react';
import { LogoMark } from '../../../components/Logo';
import { Menu } from '../../../components/Menu';
import { Toast, type ToastMessage } from '../../../components/Toast';
import { svgSnapshot, svgToPng } from '../../../components/canvas/exportImage';
import { downloadBlob, downloadText } from '../../../utils/download';
import { formatNumber } from '../../../utils/units';
import { StatusBadge } from '../../../components/StatusBadge';
import { getModule } from '../../registry';
import { gridSpacing, isTypingTarget } from '../../../components/canvas/EngineeringCanvas';
import type { Point, Viewport } from '../../../utils/viewport';
import { EMPTY_MODEL, editorReducer, initialEditorState, parseKey } from '../editor/editorState';
import type { TrussModel } from '../models/truss';
import { snapValue } from '../editor/geometry';
import { analyzeTruss } from '../solver/analyze';
import { indexAnalysis, type AnalysisRun } from '../results/analysisRun';
import { DEFAULT_DISPLAY, type ResultsDisplay } from '../results/resultsView';
import { displacementsCsv, memberForcesCsv, reactionsCsv } from '../results/csv';
import { EXAMPLES, getExample } from '../examples/examples';
import { parseProjectText, serializeProject, slugify, type TrussProject } from '../project/projectFile';
import { loadAutosave, saveAutosave } from '../project/storage';
import { PropertiesPanel } from './PropertiesPanel';
import { ResultsPanel, type ResultsTab } from './ResultsPanel';
import { ResultsOverlay } from './ResultsOverlay';
import { deformScale, type CanvasResults } from './ResultsLayer';
import { TrussEditorCanvas } from './TrussEditorCanvas';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { TOOLS, type ToolId } from './tools';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';
const UNTITLED = 'Untitled truss';
/** Project files are small; anything larger is almost certainly the wrong file. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function TrussWorkspace() {
  // The last session's project, restored from browser storage (null on a first visit).
  const [restored] = useState(loadAutosave);
  const [editor, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(restored?.model));
  const [name, setName] = useState(restored?.name ?? UNTITLED);
  const [tool, setToolState] = useState<ToolId>('select');
  const [memberStart, setMemberStart] = useState<string | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [showProps, setShowProps] = useState(() => window.innerWidth >= 1024);
  const [showResults, setShowResults] = useState(() => window.innerHeight >= 640);
  const [fitKey, setFitKey] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'unavailable'>('saved');
  const [plain, setPlain] = useState(false);
  const [dropping, setDropping] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toastId = useRef(0);

  const notify = useCallback((tone: ToastMessage['tone'], message: string, details?: readonly string[]) => {
    setToast({ id: ++toastId.current, tone, message, ...(details ? { details } : {}) });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // --- Analysis ------------------------------------------------------------------
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [live, setLive] = useState(false);
  const [display, setDisplay] = useState<ResultsDisplay>(DEFAULT_DISPLAY);
  const [modeIndex, setModeIndex] = useState(0);
  const [resultsTab, setResultsTab] = useState<ResultsTab>('diagnostics');

  const solve = (model: TrussModel): AnalysisRun => ({ model, result: analyzeTruss(model) });

  const runAnalysis = () => {
    const next = solve(editor.model);
    setRun(next);
    setModeIndex(0);
    setShowResults(true);
    setResultsTab(next.result.status === 'solved' ? 'forces' : 'diagnostics');
  };

  // Live mode re-solves whenever the model changes (each solve is a few ms for typical trusses).
  useEffect(() => {
    if (live && run?.model !== editor.model) {
      setRun(solve(editor.model));
      setModeIndex(0);
    }
  }, [live, editor.model, run?.model]);

  const index = useMemo(() => (run ? indexAnalysis(run) : null), [run]);
  // Results are only shown for the exact model they were computed from.
  const stale = run !== null && run.model !== editor.model;
  const canvasResults: CanvasResults | null = run && index && !stale ? { run, index, display, modeIndex } : null;
  const freshSolved = !stale && index?.status === 'solved' ? index : null;

  // --- Project: load, save, autosave, export -------------------------------------
  const loadProject = (project: TrussProject, message: string) => {
    dispatch({ type: 'replaceModel', model: project.model }); // undoable
    setName(project.name);
    setRun(null);
    setModeIndex(0);
    setFitKey((k) => k + 1);
    notify('info', message);
  };

  const openFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      notify('error', `${file.name} is too large to be a SimForge project.`);
      return;
    }
    const r = parseProjectText(await file.text());
    if (r.ok) loadProject(r.project, `Opened ${file.name}`);
    else notify('error', `Could not open ${file.name}`, r.errors);
  };

  const saveProject = () => {
    const filename = `${slugify(name)}.simforge.json`;
    downloadText(serializeProject({ name, model: editor.model }), filename, 'application/json');
    notify('info', `Downloaded ${filename}`);
  };

  const exportImage = async (kind: 'png' | 'svg') => {
    // Re-render without selection, hover and previews, take the snapshot, then restore.
    flushSync(() => setPlain(true));
    let snap: ReturnType<typeof svgSnapshot> | null = null;
    try {
      if (svgRef.current) snap = svgSnapshot(svgRef.current, imageCaption(name, canvasResults));
    } finally {
      setPlain(false);
    }
    if (!snap) return;
    const filename = `${slugify(name)}.${kind}`;
    try {
      if (kind === 'svg') downloadText(snap.text, filename, 'image/svg+xml');
      else downloadBlob(await svgToPng(snap.text, snap.width, snap.height), filename);
      notify('info', `Downloaded ${filename}`);
    } catch (e) {
      notify('error', `Image export failed: ${(e as Error).message}`);
    }
  };

  const exportCsv = (tab: Exclude<ResultsTab, 'diagnostics'>) => {
    if (!run || !freshSolved) return;
    const [text, suffix] =
      tab === 'forces'
        ? [memberForcesCsv(run, freshSolved), 'member-forces']
        : tab === 'displacements'
          ? [displacementsCsv(run, freshSolved), 'displacements']
          : [reactionsCsv(run, freshSolved), 'reactions'];
    const filename = `${slugify(name)}-${suffix}.csv`;
    downloadText(text, filename, 'text/csv');
    notify('info', `Downloaded ${filename}`);
  };

  // Autosave shortly after each change.
  useEffect(() => {
    setSaveState('pending');
    const t = setTimeout(() => setSaveState(saveAutosave({ name, model: editor.model }) ? 'saved' : 'unavailable'), 400);
    return () => clearTimeout(t);
  }, [name, editor.model]);

  // Open ?example=<id> links (from the homepage), once.
  const [params, setParams] = useSearchParams();
  const handledExample = useRef(false);
  useEffect(() => {
    const id = params.get('example');
    if (id === null || handledExample.current) return;
    handledExample.current = true;
    const example = getExample(id);
    if (example) loadProject({ name: example.title, model: example.model }, `Loaded example: ${example.title}`);
    else notify('error', `Unknown example "${id}".`);
    setParams({}, { replace: true });
  }, [params]);

  const setTool = (t: ToolId) => {
    setToolState(t);
    setMemberStart(null);
  };

  const spacing = viewport ? gridSpacing(viewport.scale) : null;
  const snapStep = spacing?.minor ?? 0.5;

  useEffect(() => {
    document.title = '2D Truss Analysis · SimForge';
    return () => {
      document.title = 'SimForge';
    };
  }, []);

  // Keyboard shortcuts. Values are read through a ref so the listener is bound once.
  const latest = useRef({ editor, memberStart, snapStep, runAnalysis, saveProject });
  latest.current = { editor, memberStart, snapStep, runAnalysis, saveProject };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const { editor: ed, memberStart: start, snapStep: step } = latest.current;

      if (mod && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        dispatch({ type: 'selectAll' });
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        latest.current.saveProject();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        fileInput.current?.click();
        return;
      }
      if (mod || e.altKey) return;

      // Space pans only when nothing else has focus: on a focused button, radio or
      // table row it must keep its normal "activate" meaning for keyboard users.
      if (e.code === 'Space' && (e.target === document.body || e.target === document.documentElement)) {
        e.preventDefault();
        setSpacePan(true);
        return;
      }
      if (e.key === 'Escape') {
        if (start) setMemberStart(null);
        else dispatch({ type: 'clearSelection' });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        dispatch({ type: 'deleteSelection' });
        return;
      }
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      const dir = nudge[e.key];
      if (dir) {
        // Move selected nodes by one snap step (×10 with Shift).
        const ids = new Set(ed.selection.map(parseKey).filter((k) => k.kind === 'node').map((k) => k.id));
        if (ids.size === 0) return;
        e.preventDefault();
        const d = step * (e.shiftKey ? 10 : 1);
        const positions: Record<string, Point> = {};
        for (const n of ed.model.nodes)
          if (ids.has(n.id)) positions[n.id] = { x: snapValue(n.x + dir[0] * d, 1e-6), y: snapValue(n.y + dir[1] * d, 1e-6) };
        dispatch({ type: 'moveNodes', positions });
        return;
      }
      if (key === 'l') {
        setShowLabels((v) => !v);
        return;
      }
      if (key === 'r') {
        latest.current.runAnalysis();
        return;
      }
      const def = TOOLS.find((t) => t.shortcut.toLowerCase() === key);
      if (def) {
        setToolState(def.id);
        setMemberStart(null);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    const onBlur = () => setSpacePan(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const activeTool = TOOLS.find((t) => t.id === (spacePan ? 'pan' : tool))!;
  const hint =
    tool === 'member' && memberStart && !spacePan
      ? `Drawing from ${memberStart} · Click a node or empty space to continue · Esc to stop`
      : activeTool.hint;
  const { model } = editor;

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null || !e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        const file = e.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow reopening the same file
          if (file) void openFile(file);
        }}
      />
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-muted hover:bg-raised hover:text-fg"
          aria-label="Back to SimForge home"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <LogoMark className="size-5 text-accent" />
        </Link>
        <div className="h-5 w-px bg-line" aria-hidden="true" />
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <h1 className="hidden font-medium lg:block">2D Truss Analysis</h1>
          <span className="hidden xl:inline-flex">
            <StatusBadge status={getModule('truss-2d')!.status} />
          </span>
        </div>
        <Menu
          label="File"
          icon={<FileText className="size-4" aria-hidden="true" />}
          items={[
            {
              label: 'New model',
              description: 'Start an empty model (the current one can be restored with undo)',
              onSelect: () => loadProject({ name: UNTITLED, model: EMPTY_MODEL }, 'New model'),
            },
            { label: 'Open project…', shortcut: `${MOD}O`, onSelect: () => fileInput.current?.click(), separator: true },
            { label: 'Save project (.json)', shortcut: `${MOD}S`, onSelect: saveProject },
            { label: 'Export image (PNG)', onSelect: () => void exportImage('png'), disabled: model.nodes.length === 0, separator: true },
            { label: 'Export image (SVG)', onSelect: () => void exportImage('svg'), disabled: model.nodes.length === 0 },
          ]}
        />
        <Menu
          label="Examples"
          wide
          icon={<BookOpen className="size-4" aria-hidden="true" />}
          items={EXAMPLES.map((ex) => ({
            label: ex.title,
            description: ex.summary,
            onSelect: () => loadProject({ name: ex.title, model: ex.model }, `Loaded example: ${ex.title}`),
          }))}
        />
        <ProjectName name={name} onChange={setName} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton label={`Undo (${MOD}Z)`} disabled={editor.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton
            label={`Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Y'})`}
            disabled={editor.future.length === 0}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <Redo2 className="size-4" />
          </IconButton>
          <div className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
          <span className="hidden sm:contents">
            <IconButton
              label={showResults ? 'Hide results panel' : 'Show results panel'}
              pressed={showResults}
              onClick={() => setShowResults((v) => !v)}
            >
              <PanelBottom className="size-4" />
            </IconButton>
          </span>
          <IconButton
            label={showProps ? 'Hide properties panel' : 'Show properties panel'}
            pressed={showProps}
            onClick={() => setShowProps((v) => !v)}
          >
            <PanelRight className="size-4" />
          </IconButton>
          <label
            className="ml-2 hidden cursor-pointer items-center gap-1.5 text-[12px] text-muted hover:text-fg sm:flex"
            title="Re-run the analysis automatically after every edit"
          >
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => {
                setLive(e.target.checked);
                if (e.target.checked) setShowResults(true);
              }}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            Live
          </label>
          <button
            type="button"
            onClick={runAnalysis}
            title="Run analysis (R)"
            className="relative ml-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-strong sm:px-3"
          >
            <Play className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Run analysis</span>
            {stale && !live && (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-panel bg-deformed" aria-label="Results out of date" />
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <WorkspaceToolbar tool={tool} onToolChange={setTool} />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <TrussEditorCanvas
              editor={editor}
              dispatch={dispatch}
              tool={tool}
              spacePan={spacePan}
              viewport={viewport}
              onViewportChange={setViewport}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((v) => !v)}
              snap={snap}
              onToggleSnap={() => setSnap((v) => !v)}
              snapStep={snapStep}
              showLabels={showLabels}
              onCursorChange={setCursor}
              memberStart={memberStart}
              onMemberStartChange={setMemberStart}
              results={canvasResults}
              fitKey={fitKey}
              svgRef={svgRef}
              plain={plain}
              resultsOverlay={
                <ResultsOverlay
                  model={editor.model}
                  index={index}
                  stale={stale}
                  display={display}
                  onDisplayChange={setDisplay}
                  modeIndex={modeIndex}
                  onModeIndexChange={setModeIndex}
                  deformScale={canvasResults ? deformScale(canvasResults) : null}
                  onRun={runAnalysis}
                />
              }
            />
          </div>
          {showResults && (
            <ResultsPanel
              run={run}
              index={index}
              stale={stale}
              tab={resultsTab}
              onTabChange={setResultsTab}
              selection={editor.selection}
              onSelect={(keys) => dispatch({ type: 'select', keys })}
              onExportCsv={freshSolved ? exportCsv : null}
            />
          )}
        </div>

        {showProps && (
          <PropertiesPanel
            editor={editor}
            dispatch={dispatch}
            results={freshSolved}
            onClose={() => setShowProps(false)}
            view={{
              showGrid,
              onToggleGrid: () => setShowGrid((v) => !v),
              snap,
              onToggleSnap: () => setSnap((v) => !v),
              snapStep: spacing?.minor ?? null,
              showLabels,
              onToggleLabels: () => setShowLabels((v) => !v),
            }}
          />
        )}
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 font-mono text-[11px] text-faint tabular">
        <span className="min-w-40 shrink-0">
          {cursor ? (
            <>
              x <span className="text-muted">{cursor.x.toFixed(3)}</span> y <span className="text-muted">{cursor.y.toFixed(3)}</span> m
            </>
          ) : (
            'x — y —'
          )}
        </span>
        <span className="hidden shrink-0 md:inline">{snap ? `snap ${snapStep} m` : 'snap off'}</span>
        <span className="hidden shrink-0 lg:inline">
          {model.nodes.length} nodes · {model.members.length} members
        </span>
        <span
          className={`hidden shrink-0 md:inline ${saveState === 'unavailable' ? 'text-deformed' : ''}`}
          title="Your model is kept in this browser's local storage. Use File → Save project to keep a copy."
        >
          {saveState === 'unavailable' ? 'not saved: browser storage unavailable' : saveState === 'pending' ? 'saving…' : 'saved in this browser'}
        </span>
        <span className="ml-auto hidden truncate font-sans text-muted sm:inline">
          <span className="text-fg">{activeTool.label}</span> · {hint}
        </span>
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} />
      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-bg/70 backdrop-blur-sm">
          <p className="rounded-md border border-dashed border-accent px-6 py-4 text-sm text-fg">Drop a .simforge.json file to open it</p>
        </div>
      )}
    </div>
  );
}

/** Caption for exported images: what the colours mean, so the image stands on its own. */
function imageCaption(name: string, results: CanvasResults | null) {
  // Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
  const left = `${name} · SimForge · ${new Date().toLocaleDateString('en-CA')}`;
  if (!results || results.index.status !== 'solved') return { left, right: 'Geometry, supports and loads (kN)' };
  const parts =
    results.display.colorBy === 'force'
      ? [`Axial force: blue tension, red compression, max |N| ${formatNumber(results.index.maxAbsForce / 1e3, 4)} kN`]
      : ['Utilisation |σ|/σy (yield only, buckling not checked): green low, red ≥ 1'];
  const scale = deformScale(results);
  if (results.display.showDeformed && scale !== null) parts.push(`deformed shape ×${formatNumber(scale, 3)}`);
  return { left, right: parts.join(' · ') };
}

/** Inline-editable project name. */
function ProjectName({ name, onChange }: { name: string; onChange: (n: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const v = draft.trim().slice(0, 120);
    if (v && v !== name) onChange(v);
    else setDraft(name);
  };
  return (
    <input
      aria-label="Project name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className="hidden h-8 min-w-0 max-w-64 flex-1 truncate rounded border border-transparent bg-transparent px-2 text-sm text-fg hover:border-line-strong focus:border-accent focus:outline-none md:block"
    />
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded hover:bg-raised disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${
        pressed === false ? 'text-faint' : 'text-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
