import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@shared/lib/theme';
import { ToastProvider, GlobalLoaderProvider } from '@shared/ui';

// Create a client for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * App Providers - Wraps the entire app with necessary providers.
 * Order matters: outermost providers are listed first.
 *
 * Provider hierarchy:
 * 1. QueryClientProvider - Server state management (TanStack Query)
 * 2. BrowserRouter - Client-side routing
 * 3. ThemeProvider - Theme management
 * 4. GlobalLoaderProvider - Global full screen action loader
 * 5. ToastProvider - In-app notifications
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider defaultTheme="system" storageKey="app-theme">
          <GlobalLoaderProvider>
            <ToastProvider>{children}</ToastProvider>
          </GlobalLoaderProvider>
        </ThemeProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
