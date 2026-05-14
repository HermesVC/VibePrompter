import { AppProviders } from './providers';
import { AppRouter } from './router';

/**
 * Main App component - Composition root only
 * NO business logic should be placed here
 */
export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
