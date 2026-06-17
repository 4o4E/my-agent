import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import type { StreamdownProps } from 'streamdown';
import { useMemo } from 'react';
import { useThemeCtx } from '@/theme';

export const streamdownPlugins = { cjk, code, math, mermaid };
export const streamdownPreviewPlugins = { cjk, math, mermaid };

export function useThemedMermaid(): StreamdownProps['mermaid'] {
  const { theme } = useThemeCtx();

  return useMemo(
    () => ({
      config: {
        // 使用 Mermaid 内置主题，避免自定义灰蓝色板覆盖正常图表配色语义。
        theme: theme === 'dark' ? 'dark' : 'default',
      },
    }),
    [theme],
  );
}
