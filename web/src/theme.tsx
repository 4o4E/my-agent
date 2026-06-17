import { createContext, useContext, type ReactNode } from 'react';
import { useTheme, type Theme } from './useTheme';

interface ThemeCtx {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme, toggle] = useTheme();
  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export const useThemeCtx = () => useContext(Ctx);
