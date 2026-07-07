import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function CrashOnRender(): ReactElement {
  throw new Error('Loading chunk 42 failed');
}

describe('ErrorBoundary', () => {
  it('renders a recovery UI when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <CrashOnRender />
      </ErrorBoundary>,
    );

    expect(screen.getByText('页面加载出错')).toBeInTheDocument();
    expect(screen.getByText(/页面资源加载失败/)).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('reloads the page when the refresh button is clicked', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(
      <ErrorBoundary>
        <CrashOnRender />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: '刷新页面' }));
    expect(reload).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
