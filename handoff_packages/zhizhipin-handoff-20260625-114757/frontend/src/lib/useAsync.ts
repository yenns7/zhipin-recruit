// Canonical data-fetching hook for HireInsight feature pages.
//
// Wraps the fetch-on-mount -> loading / error / data lifecycle so every page
// (candidate list, jobs, pipeline, BI) loads data the same way. Hand-rolled on
// purpose: no react-query, matching the project's minimal-deps style.
//
// Usage in a feature page:
//
//   import { useAsync } from '../lib/useAsync';
//   import { api } from '../lib/api';
//
//   function CandidatesPage() {
//     // `fn` is called on mount and whenever a value in `deps` changes.
//     const { data, loading, error, reload } = useAsync(
//       () => api.listCandidates(),
//       []
//     );
//
//     if (loading) return <Spinner />;
//     if (error) return <p>{error.message}</p>;
//     return <CandidateTable rows={data ?? []} onRefresh={reload} />;
//   }
//
// For a route param, pass it in `deps` so the fetch re-runs when it changes:
//
//   const { jobId } = useParams();
//   const { data } = useAsync(() => api.getPipeline(Number(jobId)), [jobId]);
//
// 401s are handled globally (see setUnauthorizedHandler in api.ts), so pages
// only need to render `error` for genuine failures.

import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { ApiError } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | Error | null;
  // Re-run the async function (e.g. after a mutation) without changing deps.
  reload: () => void;
}

// Generic over the result type T. `fn` should return a promise (typically an
// `api.*` call). It re-runs on mount and whenever `deps` change.
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  // Bumping this triggers a re-fetch without altering the caller's deps.
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}

// Alias for readability at call sites that prefer the "API" framing.
export const useApi = useAsync;
