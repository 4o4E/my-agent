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
        theme: 'base',
        themeVariables:
          theme === 'dark'
            ? {
                background: '#0f1113',
                primaryColor: '#1d2934',
                primaryTextColor: '#f4f7f8',
                primaryBorderColor: '#8fb3c8',
                secondaryColor: '#1d2f31',
                secondaryTextColor: '#f4f7f8',
                secondaryBorderColor: '#7fb6b3',
                tertiaryColor: '#262c3d',
                tertiaryTextColor: '#f4f7f8',
                tertiaryBorderColor: '#9aa9d6',
                mainBkg: '#1d2934',
                secondBkg: '#1d2f31',
                lineColor: '#8fa3ad',
                textColor: '#e6ecef',
                nodeBorder: '#8fb3c8',
                clusterBkg: '#15191d',
                clusterBorder: '#46535d',
                titleColor: '#f4f7f8',
                edgeLabelBackground: '#15191d',
                pie1: '#8fb3c8',
                pie2: '#7fb6b3',
                pie3: '#8d9cc1',
                pie4: '#9aa9d6',
                pie5: '#7fb3a9',
                pie6: '#8fa3ad',
                pie7: '#a7b7c2',
                pie8: '#8d9cc1',
                pie9: '#a7b7c2',
                pie10: '#6f9fa8',
                pie11: '#7894b8',
                pie12: '#8f9ed0',
                pieOuterStrokeColor: '#46535d',
                pieSectionTextColor: '#0f1113',
                pieTitleTextSize: '18px',
              }
            : {
                background: '#f6f8fa',
                primaryColor: '#e7eef5',
                primaryTextColor: '#1f2933',
                primaryBorderColor: '#6f8798',
                secondaryColor: '#e7f1f2',
                secondaryTextColor: '#1f2933',
                secondaryBorderColor: '#6f999a',
                tertiaryColor: '#eceff7',
                tertiaryTextColor: '#1f2933',
                tertiaryBorderColor: '#7788b5',
                lineColor: '#647482',
                textColor: '#1f2933',
                mainBkg: '#e7eef5',
                secondBkg: '#e7f1f2',
                nodeBorder: '#6f8798',
                clusterBkg: '#eef2f5',
                clusterBorder: '#c4ccd3',
                titleColor: '#1f2933',
                edgeLabelBackground: '#f6f8fa',
                pie1: '#6f8798',
                pie2: '#6f999a',
                pie3: '#7580a8',
                pie4: '#7788b5',
                pie5: '#5f9c96',
                pie6: '#8a9aa6',
                pie7: '#9aabc0',
                pie8: '#7580a8',
                pie9: '#8a9aa6',
                pie10: '#6f9fa8',
                pie11: '#7894b8',
                pie12: '#7e8ebf',
                pieOuterStrokeColor: '#c4ccd3',
                pieSectionTextColor: '#f8f8f6',
                pieTitleTextSize: '18px',
              },
      },
    }),
    [theme],
  );
}
