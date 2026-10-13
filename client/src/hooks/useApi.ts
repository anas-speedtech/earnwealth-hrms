import { useState, useCallback } from 'react';

interface UseApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

export function useApi<T>(
  fn: () => Promise<{ data: { data: T } }>,
): [UseApiState<T>, () => Promise<void>] {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const execute = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const result = await fn();
      setState({ data: result.data.data, isLoading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Something went wrong',
      });
    }
  }, [fn]);

  return [state, execute];
}
