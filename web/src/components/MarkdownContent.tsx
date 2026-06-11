import { Streamdown } from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';

// Streamdown is a streaming-aware react-markdown drop-in: it completes partial
// tokens mid-stream (no flicker), highlights code via Shiki (light/dark), and
// ships copy/download controls, line numbers, tables, math and mermaid. It owns
// all markdown rendering now — the old MarkdownContent + CodeBlock + the bespoke
// `.md` prose CSS are gone.
export function MarkdownContent({ text }: { text: string }) {
  return (
    <Streamdown
      className="text-sm leading-relaxed text-foreground [&_pre]:my-2 [&_pre]:max-h-[70vh] [&_pre]:overflow-auto"
      parseIncompleteMarkdown
      plugins={{ cjk, code, math, mermaid }}
      shikiTheme={['github-light', 'github-dark']}
    >
      {text}
    </Streamdown>
  );
}
