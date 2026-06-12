import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BundledLanguage } from 'shiki';
import { ChevronRight, FileText, Folder, FolderOpen, Paperclip, RefreshCw, X } from 'lucide-react';
import { listRemoteFiles, previewRemoteFile, type FilePreview, type RemoteFileEntry } from '@/api';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PreviewChunk {
  startLine: number;
  lines: string[];
}

interface PreviewRow {
  lineNumber: number;
  text: string;
}

interface Props {
  open: boolean;
  width: number;
  previewPath: string | null;
  onClose: () => void;
  onAttach: (entry: { kind: 'remote'; path: string; name: string; size?: number }) => void;
}

const LANGUAGE_BY_EXT: Record<string, BundledLanguage> = {
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  css: 'css',
  go: 'go',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  csv: 'csv',
  py: 'python',
  rs: 'rust',
  sh: 'shellscript',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'tsx',
  toml: 'toml',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};
const INITIAL_PREVIEW_LINES = 80;
const MORE_PREVIEW_LINES = 240;

function fileName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function formatSize(size?: number): string {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function extOf(path: string): string {
  const name = fileName(path);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function languageForPath(path: string): BundledLanguage {
  return LANGUAGE_BY_EXT[extOf(path)] ?? 'log';
}

function fileTone(path: string): string {
  const ext = extOf(path);
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return 'text-yellow-600 dark:text-yellow-400';
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return 'text-emerald-600 dark:text-emerald-400';
  if (['css', 'html', 'md'].includes(ext)) return 'text-sky-600 dark:text-sky-400';
  if (['py', 'rs', 'go', 'java', 'c', 'cpp'].includes(ext)) return 'text-violet-600 dark:text-violet-400';
  return 'text-muted-foreground';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function startTreeResize(event: ReactPointerEvent, width: number, onChange: (width: number) => void) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = width;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (moveEvent: PointerEvent) => {
    onChange(clamp(startWidth + moveEvent.clientX - startX, 220, 420));
  };
  const onUp = () => {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

export function RemoteFilesPanel({ open, width, previewPath, onClose, onAttach }: Props) {
  const [currentPath, setCurrentPath] = useState('.');
  const [treeWidth, setTreeWidth] = useState(270);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['.']));
  const [treeEntries, setTreeEntries] = useState<Record<string, RemoteFileEntry[]>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | undefined>();
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [chunks, setChunks] = useState<PreviewChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previewRequestRef = useRef(0);
  const pendingPreviewStartsRef = useRef<Set<number>>(new Set());

  async function loadDir(path = currentPath, select = true) {
    setLoading(true);
    setError(null);
    try {
      const data = await listRemoteFiles(path);
      if (select) setCurrentPath(data.path);
      setTreeEntries((current) => ({ ...current, [data.path]: data.entries }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openFile(path: string, size?: number, startLine = 1) {
    if (startLine > 1 && pendingPreviewStartsRef.current.has(startLine)) return;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    if (startLine === 1) {
      pendingPreviewStartsRef.current.clear();
      setSelectedPath(path);
      setSelectedSize(size);
      setPreview(null);
      setChunks([]);
    } else {
      pendingPreviewStartsRef.current.add(startLine);
    }
    setLoading(true);
    setError(null);
    try {
      const limit = startLine === 1 ? INITIAL_PREVIEW_LINES : MORE_PREVIEW_LINES;
      const data = await previewRemoteFile(path, startLine, limit);
      if (previewRequestRef.current !== requestId) return;
      setSelectedPath(data.path);
      setSelectedSize(size ?? data.size);
      setPreview(data);
      const nextChunk = { startLine: data.startLine, lines: data.lines };
      setChunks((current) => startLine === 1 ? [nextChunk] : [...current, nextChunk]);
    } catch (err) {
      if (previewRequestRef.current !== requestId) return;
      setError((err as Error).message);
    } finally {
      pendingPreviewStartsRef.current.delete(startLine);
      if (previewRequestRef.current === requestId) setLoading(false);
    }
  }

  async function toggleDir(path: string) {
    const willOpen = !expanded.has(path);
    setExpanded((current) => {
      const next = new Set(current);
      if (willOpen) next.add(path);
      else next.delete(path);
      return next;
    });
    setCurrentPath(path);
    if (willOpen && !treeEntries[path]) await loadDir(path, false);
  }

  useEffect(() => {
    if (open) void loadDir(currentPath);
    // 打开面板时刷新当前目录，保留用户所在位置。
  }, [open]);

  useEffect(() => {
    if (open && previewPath) void openFile(previewPath);
  }, [open, previewPath]);

  const previewLanguage = selectedPath ? languageForPath(selectedPath) : 'log';
  const previewRows = useMemo<PreviewRow[]>(() => {
    const byLine = new Map<number, string>();
    const sortedChunks = [...chunks].sort((a, b) => a.startLine - b.startLine);
    for (const chunk of sortedChunks) {
      chunk.lines.forEach((text, index) => {
        const lineNumber = chunk.startLine + index;
        if (!byLine.has(lineNumber)) byLine.set(lineNumber, text);
      });
    }

    const firstLine = sortedChunks[0]?.startLine ?? 1;
    const rows: PreviewRow[] = [];
    for (let lineNumber = firstLine; byLine.has(lineNumber); lineNumber += 1) {
      rows.push({ lineNumber, text: byLine.get(lineNumber) ?? '' });
    }
    return rows;
  }, [chunks]);
  const previewCode = useMemo(() => previewRows.map((row) => row.text).join('\n'), [previewRows]);
  const previewStartLine = previewRows[0]?.lineNumber ?? 1;
  const loadedLines = previewRows.length;
  const totalLines = preview?.totalLines ?? null;

  if (!open) return null;
  const hasUnloadedLines = preview?.mode === 'chunk' && (totalLines == null || loadedLines < totalLines);
  const nextLine = hasUnloadedLines ? previewStartLine + loadedLines : null;
  const loadMorePreview = () => {
    if (!selectedPath || nextLine == null || loading || !hasUnloadedLines) return;
    void openFile(selectedPath, selectedSize, nextLine);
  };

  const renderRows = (entries: RemoteFileEntry[] | undefined, depth: number): JSX.Element[] =>
    (entries ?? []).flatMap((entry) => {
      const isDir = entry.type === 'dir';
      const isOpen = expanded.has(entry.path);
      const selected = entry.path === selectedPath || entry.path === currentPath;
      const row = (
        <button
          key={entry.path}
          className={cn(
            'group/file flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-left text-[13px] hover:bg-accent/70',
            selected && 'bg-accent text-accent-foreground',
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => isDir ? void toggleDir(entry.path) : void openFile(entry.path, entry.size)}
          title={entry.path}
        >
          {isDir ? (
            <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {isDir ? (
            isOpen ? <FolderOpen className="size-4 shrink-0 text-sky-500" /> : <Folder className="size-4 shrink-0 text-sky-500" />
          ) : (
            <FileText className={cn('size-4 shrink-0', fileTone(entry.path))} />
          )}
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {!isDir && <span className="hidden shrink-0 text-[11px] text-muted-foreground group-hover/file:inline">{formatSize(entry.size)}</span>}
        </button>
      );
      if (!isDir || !isOpen) return [row];
      return [row, ...renderRows(treeEntries[entry.path], depth + 1)];
    });

  return (
    <aside className="flex h-full shrink-0 flex-col border-l bg-card" style={{ width }}>
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">远程文件</div>
          <div className="truncate text-xs text-muted-foreground">{currentPath}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void loadDir(currentPath)} title="刷新">
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} title="关闭">
          <X className="size-4" />
        </Button>
      </div>

      {error && <div className="border-b px-3 py-2 text-xs text-destructive">{error}</div>}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 shrink-0 flex-col border-r bg-muted/20" style={{ width: treeWidth }}>
          <div className="flex h-9 items-center justify-between border-b px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Explorer</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => void loadDir(currentPath)} title="刷新目录">
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto py-1">
            <button
              className={cn(
                'flex h-7 w-full items-center gap-1.5 px-2 text-left text-[13px] hover:bg-accent/70',
                currentPath === '.' && 'bg-accent text-accent-foreground',
              )}
              onClick={() => void toggleDir('.')}
              title="workspace"
            >
              <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded.has('.') && 'rotate-90')} />
              {expanded.has('.') ? <FolderOpen className="size-4 shrink-0 text-sky-500" /> : <Folder className="size-4 shrink-0 text-sky-500" />}
              <span className="min-w-0 flex-1 truncate">workspace</span>
            </button>
            {expanded.has('.') && renderRows(treeEntries['.'], 1)}
          </div>
        </div>
        <div
          role="separator"
          aria-label="调整文件树宽度"
          className="h-full w-1 shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/60"
          onPointerDown={(event) => startTreeResize(event, treeWidth, setTreeWidth)}
        />

        <div className="min-w-0 flex-1 overflow-hidden p-3">
          {selectedPath ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{selectedPath}</div>
                  <div className="text-xs text-muted-foreground">{formatSize(selectedSize)}</div>
                  {totalLines != null && <div className="text-xs text-muted-foreground">{totalLines} 行</div>}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onAttach({ kind: 'remote', path: selectedPath, name: fileName(selectedPath), size: selectedSize })}
                >
                  <Paperclip className="size-4" />
                  添加
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                {loading && chunks.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-md border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                    正在加载前 {INITIAL_PREVIEW_LINES} 行…
                  </div>
                ) : chunks.length > 0 ? (
                  <CodeBlock
                    className="h-full"
                    code={previewCode}
                    fillHeight
                    language={previewLanguage}
                    loadingMore={loading && chunks.length > 0}
                    onReachEnd={nextLine != null ? loadMorePreview : undefined}
                    showLineNumbers
                    startLineNumber={previewStartLine}
                    showGlance
                    showRenderToggle
                    showWrapToggle
                    maxHighlightChars={80_000}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
                    暂无预览内容
                  </div>
                )}
              </div>
              {preview?.mode === 'chunk' && (
                <div className="shrink-0 text-xs text-muted-foreground">
                  已加载 {loadedLines}{totalLines != null ? ` / ${totalLines}` : ''} 行{nextLine != null ? '，滚动到底部继续加载' : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">选择一个文件查看预览</div>
          )}
        </div>
      </div>
    </aside>
  );
}
