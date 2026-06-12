import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { cn } from '@/lib/utils';

interface TocItem {
  index: number;
  text: string;
  level: number;
}

const MESSAGE_SELECTOR = '[data-toc-message]';

/** Nearest scrollable ancestor — the element the conversation actually scrolls in. */
function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * 右侧导航只认对话层级：用户锚点显示用户消息，回复锚点显示回复摘要。
 * 工具参数、工具结果和思考内容即使包含标题元素，也不会进入目录。
 */
export function TableOfContents({ contentRef }: { contentRef: RefObject<HTMLElement | null> }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const collectTargets = useCallback((root: HTMLElement) => {
    const targets: HTMLElement[] = [];
    const nextItems: TocItem[] = [];

    for (const message of Array.from(root.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR))) {
      const role = message.dataset.tocMessage;
      if (role === 'user') {
        const text = message.dataset.tocTitle || '对话';
        nextItems.push({ index: targets.length, text, level: 1 });
        targets.push(message);
        continue;
      }

      nextItems.push({ index: targets.length, text: message.dataset.tocTitle || '回复', level: 1 });
      targets.push(message);
    }

    return { items: nextItems, targets };
  }, []);

  // 对话 DOM 变化时重新扫描，包含流式输出。
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const compute = () => setItems(collectTargets(root).items);
    compute();
    const mo = new MutationObserver(compute);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [collectTargets, contentRef]);

  // 滚动时高亮最靠近顶部的消息。
  useEffect(() => {
    const root = contentRef.current;
    if (!root || items.length === 0) return;
    const { targets } = collectTargets(root);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) {
          const idx = targets.indexOf(hit.target as HTMLElement);
          if (idx >= 0) setActiveIndex(idx);
        }
      },
      { root: getScrollParent(root), rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    for (const el of targets) io.observe(el);
    return () => io.disconnect();
  }, [collectTargets, contentRef, items]);

  const handleClick = useCallback(
    (index: number) => {
      const root = contentRef.current;
      if (!root) return;
      const el = collectTargets(root).targets[index];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveIndex(index);
      }
    },
    [collectTargets, contentRef],
  );

  if (items.length === 0) return null;

  return (
    <nav className="hidden w-56 shrink-0 overflow-y-auto border-l py-4 pr-2 pl-3 xl:block">
      <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        目录
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.index}>
            <button
              type="button"
              onClick={() => handleClick(item.index)}
              title={item.text}
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              className={cn(
                'block w-full truncate rounded py-1 pr-2 text-left text-xs transition-colors hover:bg-muted',
                activeIndex === item.index
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
