import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ApiRequestError } from './api/client';
import { keys } from './api/queries';
import { applyThemePreference, readThemePreference } from './theme';
import { ToastProvider } from './ui/toast';
import './ui/tokens.css';
import './ui/base.css';
import './ui/components.css';
import './pages/pages.css';

applyThemePreference(readThemePreference());

/**
 * A 401 anywhere means the session ended (signed out elsewhere, expired): drop it so the app
 * returns to sign-in. A CSRF failure means the token is stale: reload the session.
 */
function onApiError(error: unknown) {
  if (!(error instanceof ApiRequestError)) return;
  if (error.status === 401) queryClient.setQueryData(keys.session, null);
  if (error.code === 'csrf_failed') void queryClient.invalidateQueries({ queryKey: keys.session });
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) &&
        count < 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
