import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';
import { FileText, FolderTree, Plus, Terminal, X } from 'lucide-react';
import { listShellSessions, type ShellSession } from '@/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RemoteFilesPanel } from './RemoteFilesPanel';
import { ShellPanel } from './ShellPanel';
import { cn } from '@/lib/utils';

export type RightTabId = 'files' | `file:${string}` | `shell:${string}`;

interface Props {
  open: boolean;
  width: number;
  tabs: RightTabId[];
  activeTab: RightTabId | null;
  threadId: string | null;
  onTabChange: (tab: RightTabId | null) => void;
  onOpenFileBrowser: () => void;
  onOpenFileTab: (path: string) => void;
  onOpenShellTab: (sessionId: string) => void;
  onCloseTab: (tab: RightTabId) => void;
  onClose: () => void;
  onAttach: (entry: { kind: 'remote'; path: string; name: string; size?: number }) => void;
}

interface TabSpec {
  id: RightTabId;
  label: string;
  icon: JSX.Element;
}

function isLiveSession(session: ShellSession): boolean {
  return session.status !== 'closed';
}

function shortShellId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id;
}

function fileName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function tabSpec(tab: RightTabId): TabSpec {
  if (tab === 'files') return { id: tab, label: '文件', icon: <FolderTree className="size-3.5 shrink-0" /> };
  if (tab.startsWith('file:')) {
    const path = tab.slice('file:'.length);
    return { id: tab, label: fileName(path) || '文件', icon: <FileText className="size-3.5 shrink-0" /> };
  }
  return { id: tab, label: shortShellId(tab.slice('shell:'.length)), icon: <Terminal className="size-3.5 shrink-0" /> };
}

function TabButton({
  tab,
  active,
  onClick,
  onClose,
}: {
  tab: TabSpec;
  active: boolean;
  onClick: (tab: RightTabId) => void;
  onClose: (tab: RightTabId) => void;
}) {
  return (
    <div
      className={cn(
        'group/tab ml-1 flex h-7 min-w-32 max-w-48 shrink-0 items-center rounded-md border bg-muted/40 text-xs',
        active ? 'border-primary/60 bg-background text-foreground shadow-sm' : 'border-border text-muted-foreground hover:bg-background',
      )}
    >
      <button
        type="button"
        onClick={() => onClick(tab.id)}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left transition-colors group-hover/tab:text-foreground"
        title={tab.label}
      >
        {tab.icon}
        <span className="min-w-0 flex-1 truncate">{tab.label}</span>
      </button>
      <button
        type="button"
        onClick={() => onClose(tab.id)}
        className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/tab:opacity-100"
        title="关闭预览"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function AddTabMenu({
  sessions,
  onOpenFileBrowser,
  onOpenShellTab,
}: {
  sessions: ShellSession[];
  onOpenFileBrowser: () => void;
  onOpenShellTab: (sessionId: string) => void;
}) {
  const liveSessions = sessions.filter(isLiveSession);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" title="打开预览">
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={onOpenFileBrowser}>
          <FolderTree className="mr-2 size-4" />
          文件浏览器
        </DropdownMenuItem>
        {liveSessions.map((session) => (
          <DropdownMenuItem key={session.id} onClick={() => onOpenShellTab(session.id)}>
            <Terminal className="mr-2 size-4" />
            {shortShellId(session.id)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RightSidebar({
  open,
  width,
  tabs,
  activeTab,
  threadId,
  onTabChange,
  onOpenFileBrowser,
  onOpenFileTab,
  onOpenShellTab,
  onCloseTab,
  onClose,
  onAttach,
}: Props) {
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<RightTabId, HTMLDivElement>());

  const refreshShells = useCallback(() => {
    if (!threadId) {
      setSessions([]);
      return;
    }
    listShellSessions(threadId).then((data) => setSessions(data.sessions)).catch(() => setSessions([]));
  }, [threadId]);

  useEffect(refreshShells, [refreshShells]);
  useEffect(() => {
    if (!open || !threadId) return;
    const timer = window.setInterval(refreshShells, 2500);
    return () => window.clearInterval(timer);
  }, [open, refreshShells, threadId]);

  const tabSpecs = useMemo(() => tabs.map(tabSpec), [tabs]);

  useEffect(() => {
    if (!open) return;
    if (!tabs.length) {
      if (activeTab) onTabChange(null);
      return;
    }
    if (activeTab && tabs.includes(activeTab)) return;
    onTabChange(tabs[0]);
  }, [activeTab, onTabChange, open, tabs]);

  useEffect(() => {
    if (!open || !activeTab) return;
    const tab = tabRefs.current.get(activeTab);
    tab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTab, open, tabs]);

  if (!open) return null;

  const activeShellSessionId = activeTab?.startsWith('shell:') ? activeTab.slice('shell:'.length) : null;
  const activeFilePath = activeTab?.startsWith('file:') ? activeTab.slice('file:'.length) : null;
  const scrollTabsWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const element = tabsScrollRef.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    const maxScroll = element.scrollWidth - element.clientWidth;
    const nextScroll = Math.max(0, Math.min(maxScroll, element.scrollLeft + delta));
    if (nextScroll === element.scrollLeft) return;
    event.preventDefault();
    element.scrollLeft = nextScroll;
  };

  return (
    <aside className="flex h-full shrink-0 flex-col border-l bg-card" style={{ width }}>
      <div className="flex h-11 shrink-0 items-stretch border-b bg-card">
        <div
          ref={tabsScrollRef}
          className="scrollbar-thin flex min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden pb-1 pt-1 [scrollbar-gutter:stable]"
          onWheel={scrollTabsWithWheel}
        >
          {tabSpecs.map((tab) => (
            <div
              key={tab.id}
              className="shrink-0"
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
            >
              <TabButton tab={tab} active={tab.id === activeTab} onClick={onTabChange} onClose={onCloseTab} />
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <AddTabMenu sessions={sessions} onOpenFileBrowser={onOpenFileBrowser} onOpenShellTab={onOpenShellTab} />
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} title="关闭右侧栏">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'files' && (
          <RemoteFilesPanel
            open
            width={width}
            previewPath={null}
            embedded
            onClose={onClose}
            onAttach={onAttach}
            onOpenFile={onOpenFileTab}
          />
        )}
        {activeFilePath && (
          <RemoteFilesPanel
            open
            width={width}
            previewPath={activeFilePath}
            embedded
            onClose={onClose}
            onAttach={onAttach}
            onOpenFile={onOpenFileTab}
          />
        )}
        {activeShellSessionId && (
          <ShellPanel
            open
            width={width}
            threadId={threadId}
            embedded
            previewSessionId={activeShellSessionId}
            onClose={onClose}
          />
        )}
        {!activeTab && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <div>暂无打开的预览</div>
            <AddTabMenu sessions={sessions} onOpenFileBrowser={onOpenFileBrowser} onOpenShellTab={onOpenShellTab} />
          </div>
        )}
      </div>
    </aside>
  );
}
