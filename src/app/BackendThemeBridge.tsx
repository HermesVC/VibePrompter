import { useEffect } from 'react';
import { useTheme } from '@shared/lib/theme';
import { useAppSettingsQuery } from '@features/settings/application/settings.query';

/**
 * Bridges backend `theme` and `accent` settings into the `ThemeProvider`.
 * Lives in `app/` (composition layer) so the shared `ThemeProvider` stays
 * unaware of features.
 */
export function BackendThemeBridge() {
  const { setTheme, setAccent } = useTheme();
  const { data: settings } = useAppSettingsQuery();

  useEffect(() => {
    if (!settings) return;
    const theme = settings.theme as 'light' | 'dark' | 'system';
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      setTheme(theme);
    }
    if (settings.accent) {
      setAccent(settings.accent);
    }
  }, [settings, setTheme, setAccent]);

  return null;
}
