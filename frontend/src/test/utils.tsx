import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../components/ui';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react';
