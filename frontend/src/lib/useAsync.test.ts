import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAsync } from './useAsync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsync', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once and eventually resolves data', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce('recovered');

    const { result } = renderHook(() =>
      useAsync(fn, [], { retryCount: 1, retryDelay: 0, key: 'retry-case' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('recovered');
    expect(result.current.error).toBeNull();
  });

  it('deduplicates concurrent requests with the same key', async () => {
    const request = deferred<string>();
    const fn = vi.fn(() => request.promise);

    const first = renderHook(() => useAsync(fn, [], { key: 'shared-request' }));
    const second = renderHook(() => useAsync(fn, [], { key: 'shared-request' }));

    expect(fn).toHaveBeenCalledTimes(1);

    request.resolve('shared-result');

    await waitFor(() => expect(first.result.current.data).toBe('shared-result'));
    await waitFor(() => expect(second.result.current.data).toBe('shared-result'));

    expect(second.result.current.loading).toBe(false);
    first.unmount();
    second.unmount();
  });

  it('does not commit error state after unmount while a retry is still pending', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('always fail'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useAsync(fn, [], { retryCount: 1, retryDelay: 20, key: 'unmount-case' }),
    );

    expect(result.current.loading).toBe(true);

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('aborts the active request signal on unmount', async () => {
    const request = deferred<string>();
    let capturedSignal: AbortSignal | undefined;
    const fn = vi.fn((signal?: AbortSignal) => {
      capturedSignal = signal;
      return request.promise;
    });

    const { unmount } = renderHook(() => useAsync(fn, [], { key: 'abort-case' }));

    expect(capturedSignal).toBeDefined();
    if (!capturedSignal) {
      throw new Error('expected useAsync to pass an AbortSignal to the request function');
    }
    expect(capturedSignal.aborted).toBe(false);

    unmount();

    expect(capturedSignal.aborted).toBe(true);
    request.resolve('late');
  });

  it('keeps loading true while waiting to perform a scheduled retry', async () => {
    vi.useFakeTimers();
    const retryRequest = deferred<string>();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockImplementationOnce(() => retryRequest.promise);

    const { result } = renderHook(() =>
      useAsync(fn, [], { retryCount: 1, retryDelay: 50, key: 'loading-retry-case' }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(49);
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fn).toHaveBeenCalledTimes(2);

    await act(async () => {
      retryRequest.resolve('done');
      await Promise.resolve();
    });

    expect(result.current.data).toBe('done');
    expect(result.current.loading).toBe(false);
  });
});
