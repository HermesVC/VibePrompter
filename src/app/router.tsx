import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { LoadingSpinner } from '@shared/ui';

const HomePage = lazy(() =>
  import('@features/home/pages/HomePage').then((m) => ({ default: m.HomePage }))
);
const NotFoundPage = lazy(() =>
  import('@shared/ui/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);
const CommandPalettePage = lazy(() =>
  import('@features/command-palette').then((m) => ({ default: m.CommandPalettePage }))
);
const OnboardingPage = lazy(() =>
  import('@features/onboarding').then((m) => ({ default: m.OnboardingPage }))
);
const TrayPage = lazy(() =>
  import('@features/tray').then((m) => ({ default: m.TrayPage }))
);
const OverlayPage = lazy(() =>
  import('@features/overlay-mini').then((m) => ({ default: m.OverlayPage }))
);
const ToastsPage = lazy(() =>
  import('@features/toasts').then((m) => ({ default: m.ToastsPage }))
);

const SettingsWindow = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.SettingsWindow }))
);
const GeneralPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.GeneralPanel }))
);
const ShortcutsPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.ShortcutsPanel }))
);
const ModesPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.ModesPanel }))
);
const ProvidersPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.ProvidersPanel }))
);
const HistoryPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.HistoryPanel }))
);
const AppearancePanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.AppearancePanel }))
);
const AdvancedPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.AdvancedPanel }))
);
const AboutPanel = lazy(() =>
  import('@features/settings').then((m) => ({ default: m.AboutPanel }))
);

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/palette" element={<CommandPalettePage />} />
        <Route path="/setup" element={<OnboardingPage />} />
        <Route path="/tray" element={<TrayPage />} />
        <Route path="/overlay" element={<OverlayPage />} />
        <Route path="/toasts" element={<ToastsPage />} />

        <Route path="/settings" element={<SettingsWindow />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralPanel />} />
          <Route path="shortcuts" element={<ShortcutsPanel />} />
          <Route path="modes" element={<ModesPanel />} />
          <Route path="providers" element={<ProvidersPanel />} />
          <Route path="history" element={<HistoryPanel />} />
          <Route path="appearance" element={<AppearancePanel />} />
          <Route path="advanced" element={<AdvancedPanel />} />
          <Route path="about" element={<AboutPanel />} />
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
