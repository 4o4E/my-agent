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
                background: '#09090b',
                primaryColor: '#18181b',
                primaryTextColor: '#fafafa',
                primaryBorderColor: '#fafafa',
                secondaryColor: '#27272a',
                secondaryTextColor: '#f4f4f5',
                secondaryBorderColor: '#a1a1aa',
                tertiaryColor: '#3f3f46',
                tertiaryTextColor: '#fafafa',
                tertiaryBorderColor: '#d4d4d8',
                mainBkg: '#18181b',
                secondBkg: '#27272a',
                lineColor: '#a1a1aa',
                textColor: '#f4f4f5',
                nodeBorder: '#fafafa',
                clusterBkg: '#18181b',
                clusterBorder: '#52525b',
                titleColor: '#fafafa',
                edgeLabelBackground: '#09090b',
                pie1: '#fafafa',
                pie2: '#e4e4e7',
                pie3: '#d4d4d8',
                pie4: '#a1a1aa',
                pie5: '#d9d9df',
                pie6: '#c7c7ce',
                pie7: '#b4b4bd',
                pie8: '#eeeeef',
                pie9: '#f4f4f5',
                pie10: '#e5e5e5',
                pie11: '#cccccc',
                pie12: '#b8b8b8',
                pieOuterStrokeColor: '#71717a',
                pieSectionTextColor: '#09090b',
                pieTitleTextSize: '18px',
              }
            : {
                background: '#ffffff',
                primaryColor: '#ffffff',
                primaryTextColor: '#09090b',
                primaryBorderColor: '#09090b',
                secondaryColor: '#f4f4f5',
                secondaryTextColor: '#09090b',
                secondaryBorderColor: '#d4d4d8',
                tertiaryColor: '#e4e4e7',
                tertiaryTextColor: '#09090b',
                tertiaryBorderColor: '#a1a1aa',
                lineColor: '#71717a',
                textColor: '#09090b',
                mainBkg: '#fafafa',
                secondBkg: '#f4f4f5',
                nodeBorder: '#09090b',
                clusterBkg: '#f4f4f5',
                clusterBorder: '#d4d4d8',
                titleColor: '#09090b',
                edgeLabelBackground: '#ffffff',
                pie1: '#09090b',
                pie2: '#27272a',
                pie3: '#3f3f46',
                pie4: '#52525b',
                pie5: '#3a3a3d',
                pie6: '#4a4a4e',
                pie7: '#5a5a60',
                pie8: '#1f1f22',
                pie9: '#18181b',
                pie10: '#404040',
                pie11: '#303030',
                pie12: '#606060',
                pieOuterStrokeColor: '#d4d4d8',
                pieSectionTextColor: '#ffffff',
                pieTitleTextSize: '18px',
              },
      },
    }),
    [theme],
  );
}
