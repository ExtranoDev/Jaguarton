import { useCallback, useEffect, useRef, useState } from 'react';

export const errorMessage = (err, fallback) => err.response?.data?.error || fallback;

// Loads a tab's data. `key` describes the filters: when it changes the data is refetched, but
// the previous rows stay on screen until the new ones arrive (no flash back to "Loading…").
// `reload()` refetches after a change.
export default function useAdminData(fetcher, key, failureMessage = 'Could not load this data.') {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const latestFetcher = useRef(fetcher);

  useEffect(() => {
    latestFetcher.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    latestFetcher
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, failureMessage));
      });
    return () => {
      cancelled = true;
    };
  }, [key, version, failureMessage]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

// The page of a paged list. It belongs to one set of filters (`filterKey`): when the filters change
// the list goes back to page 1, without an effect resetting it.
export function usePage(filterKey) {
  const [state, setState] = useState({ filterKey, page: 1 });
  const page = state.filterKey === filterKey ? state.page : 1;
  const setPage = useCallback((next) => setState({ filterKey, page: next }), [filterKey]);
  return [page, setPage];
}

// Follows a fast-changing value (a search box) after it has been still for `delay` ms.
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
