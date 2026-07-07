import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test/utils';
import { LoginPage } from './LoginPage';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    token: null,
    role: null,
    name: null,
    userId: null,
    isAuthenticated: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('LoginPage', () => {
  it('renders the login form fields and submit button', () => {
    render(<LoginPage />);

    expect(screen.getByText('登录工作台')).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });
});
