import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  accent: string;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: string) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  defaultAccent?: string;
  storageKey?: string;
  accentStorageKey?: string;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Theme Provider — manages light/dark mode and accent color.
 *
 * Writes `data-theme` and `data-accent` attributes on <html> so the design-token CSS
 * (which keys off `[data-theme="dark"]` / `[data-accent="..."]`) applies correctly.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  defaultAccent = 'violet',
  storageKey = 'app-theme',
  accentStorageKey = 'app-accent',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
  });

  const [accent, setAccentState] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultAccent;
    return localStorage.getItem(accentStorageKey) || defaultAccent;
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    // Apply synchronously so the very first paint uses the correct theme —
    // avoids the flash of dark/wrong-theme before the useEffect fires.
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute(
        'data-accent',
        localStorage.getItem(accentStorageKey) || defaultAccent,
      );
    }
    return resolved;
  });

  // Sync `data-theme` attribute and resolved theme with current selection / system.
  useEffect(() => {
    const apply = () => {
      const resolved = theme === 'system' ? getSystemTheme() : theme;
      setResolvedTheme(resolved);
      const root = window.document.documentElement;
      root.setAttribute('data-theme', resolved);
      // Clean up any legacy class-based theming from older versions.
      root.classList.remove('light', 'dark');
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Sync `data-accent` attribute.
  useEffect(() => {
    window.document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(storageKey, next);
    setThemeState(next);
  };

  const setAccent = (next: string) => {
    localStorage.setItem(accentStorageKey, next);
    setAccentState(next);
  };

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, accent, setTheme, setAccent, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
