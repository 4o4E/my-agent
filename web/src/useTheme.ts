import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 同步 html 的暗色类名，并持久化用户选择。 */
export function useTheme(): [Theme, (theme: Theme) => void, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return [theme, setTheme, toggle];
}
