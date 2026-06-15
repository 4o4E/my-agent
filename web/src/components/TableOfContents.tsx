import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { cn } from '@/lib/utils';

interface TocItem {
  index: number;
  text: string;
  time?: string;
  topPct: number;
}

const MESSAGE_SELECTOR = '[data-toc-message]';

/** 找到真实滚动对话内容的最近父容器。 */
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

function scrollInsideContainer(container: HTMLElement, target: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = container.scrollTop + targetRect.top - containerRect.top - 12;
  container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
}

/**
 * 对话锚点轨道只认用户消息，贴在真实滚动条旁边。
 * marker 的位置来自消息在滚动容器里的相对高度，悬浮时显示消息摘要。
 */
export function TableOfContents({ contentRef }: { contentRef: RefObject<HTMLElement | null> }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const collectTargets = useCallback((root: HTMLElement) => {
    const targets: HTMLElement[] = [];
    const nextItems: TocItem[] = [];
    const scrollParent = getScrollParent(root);
    const scrollRange = Math.max(1, (scrollParent?.scrollHeight ?? root.scrollHeight) - (scrollParent?.clientHeight ?? 0));

    for (const message of Array.from(root.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR))) {
      const role = message.dataset.tocMessage;
      if (role !== 'user') continue;
      const containerRect = scrollParent?.getBoundingClientRect();
      const messageRect = message.getBoundingClientRect();
      const absoluteTop = scrollParent && containerRect
        ? scrollParent.scrollTop + messageRect.top - containerRect.top
        : message.offsetTop;
      const topPct = Math.min(100, Math.max(0, (absoluteTop / scrollRange) * 100));
      const text = message.dataset.tocTitle || '对话';
      nextItems.push({ index: targets.length, text, time: message.dataset.tocTime, topPct });
      targets.push(message);
    }

    return { items: nextItems, targets };
  }, []);

  // 对话 DOM 变化时重新扫描，包含流式输出。
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const compute = () => setItems(collectTargets(root).items);
    const scrollParent = getScrollParent(root);
    compute();
    const mo = new MutationObserver(compute);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    scrollParent?.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      mo.disconnect();
      ro.disconnect();
      scrollParent?.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
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
        const scrollParent = getScrollParent(root);
        if (scrollParent) scrollInsideContainer(scrollParent, el);
        setActiveIndex(index);
      }
    },
    [collectTargets, contentRef],
  );

  if (items.length === 0) return null;

  return (
    <nav className="hidden w-7 shrink-0 border-l bg-background/80 py-3 xl:block" aria-label="对话锚点">
      <div className="relative mx-auto h-full w-3 rounded-full bg-border/50">
        {items.map((item) => (
          <button
            key={item.index}
            type="button"
            onClick={() => handleClick(item.index)}
            title={item.time ? `${item.time}\n${item.text}` : item.text}
            style={{ top: `${item.topPct}%` }}
            className={cn(
              'group absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all hover:z-20 hover:scale-125',
              'bg-primary/80',
              activeIndex === item.index ? 'border-primary bg-background ring-2 ring-primary/70' : 'border-background',
            )}
            aria-label={item.text}
          >
            <span className="pointer-events-none absolute right-4 top-1/2 hidden w-96 max-w-[min(24rem,calc(100vw-6rem))] -translate-y-1/2 rounded-md border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-lg group-hover:block">
              <span className="block whitespace-nowrap text-[10px] text-muted-foreground">
                用户消息
              </span>
              {item.time && <span className="mt-0.5 block whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{item.time}</span>}
              <span className="line-clamp-8 break-words leading-5">{item.text}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
