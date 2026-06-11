import type { UIMessage } from 'ai';
import { Conversation } from './Conversation';
import { Composer, type ComposerAttachment } from './Composer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FolderTree, PanelRightClose, PanelRightOpen, Square } from 'lucide-react';

interface Props {
  title: string;
  messages: UIMessage[];
  busy: boolean;
  draft: string;
  wide: boolean;
  workspaceRoot: string | null;
  attachments: ComposerAttachment[];
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onCancel: () => void;
  onToggleWide: () => void;
  onRemoveAttachment: (path: string) => void;
  filesOpen: boolean;
  onToggleRemoteFiles: () => void;
  onOpenRemoteFiles: () => void;
  onUploadLocal: (file: File, path: string) => Promise<void>;
  onOpenRemoteFile: (path: string) => void;
}

export function ChatView({
  title,
  messages,
  busy,
  draft,
  wide,
  workspaceRoot,
  attachments,
  onDraftChange,
  onSend,
  onCancel,
  onToggleWide,
  onRemoveAttachment,
  filesOpen,
  onToggleRemoteFiles,
  onOpenRemoteFiles,
  onUploadLocal,
  onOpenRemoteFile,
}: Props) {
  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center border-b bg-card px-6">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        <Badge variant={busy ? 'default' : 'secondary'} className="ml-3">
          {busy ? '运行中' : '空闲'}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} title="终止当前对话">
              <Square className="size-3.5" />
              终止
            </Button>
          )}
          <Button
            type="button"
            variant={filesOpen ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleRemoteFiles}
            title={filesOpen ? '关闭文件目录' : '打开文件目录'}
          >
            <FolderTree className="size-4" />
            文件
            {filesOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Conversation messages={messages} busy={busy} wide={wide} workspaceRoot={workspaceRoot} onOpenRemoteFile={onOpenRemoteFile} />
      </div>

      <Composer
        disabled={busy}
        draft={draft}
        wide={wide}
        attachments={attachments}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onCancel={onCancel}
        onToggleWide={onToggleWide}
        onRemoveAttachment={onRemoveAttachment}
        onOpenRemoteFiles={onOpenRemoteFiles}
        onUploadLocal={onUploadLocal}
      />
    </main>
  );
}
