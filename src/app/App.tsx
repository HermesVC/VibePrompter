import { AppProviders } from './providers';
import { AppRouter } from './router';
import { BackendThemeBridge } from './BackendThemeBridge';

/**
 * Main App component - Composition root only
 * NO business logic should be placed here
 */
export function App() {
  return (
    <AppProviders>
      <BackendThemeBridge />
      <AppRouter />
    </AppProviders>
  );
}
