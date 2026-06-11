import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { cn } from '@/lib/utils';

interface TocItem {
  index: number;
  text: string;
  level: number;
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

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
 * Right-rail navigation built from the markdown headings (h1–h6) rendered inside
 * `contentRef`. Headings are addressed by their ordinal position so the rail keeps
 * working across Streamdown re-renders (which discard any injected ids).
 */
export function TableOfContents({ contentRef }: { contentRef: RefObject<HTMLElement | null> }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Re-scan headings whenever the conversation DOM changes (incl. streaming).
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const compute = () => {
      const heads = Array.from(root.querySelectorAll<HTMLHeadingElement>(HEADING_SELECTOR));
      setItems(
        heads
          .map((el, index) => ({
            index,
            text: el.textContent?.trim() ?? '',
            level: Number(el.tagName[1]) || 1,
          }))
          .filter((h) => h.text.length > 0),
      );
    };
    compute();
    const mo = new MutationObserver(compute);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [contentRef]);

  // Scroll-spy: highlight the heading nearest the top of the viewport.
  useEffect(() => {
    const root = contentRef.current;
    if (!root || items.length === 0) return;
    const heads = Array.from(root.querySelectorAll<HTMLHeadingElement>(HEADING_SELECTOR));
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) {
          const idx = heads.indexOf(hit.target as HTMLHeadingElement);
          if (idx >= 0) setActiveIndex(idx);
        }
      },
      { root: getScrollParent(root), rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    for (const el of heads) io.observe(el);
    return () => io.disconnect();
  }, [contentRef, items]);

  const handleClick = useCallback(
    (index: number) => {
      const root = contentRef.current;
      if (!root) return;
      const heads = root.querySelectorAll<HTMLHeadingElement>(HEADING_SELECTOR);
      const el = heads[index];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveIndex(index);
      }
    },
    [contentRef],
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
