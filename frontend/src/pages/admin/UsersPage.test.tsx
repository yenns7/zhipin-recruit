import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { UsersPage } from './UsersPage';
import { api } from '../../lib/api';
import type { AdminUser } from '../../types';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      resetUserPassword: vi.fn(),
    },
  };
});

const users: AdminUser[] = [];

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listUsers).mockResolvedValue(users);
  });

  it('uses the shared alert-style error state when creating a user fails', async () => {
    vi.mocked(api.createUser).mockRejectedValueOnce(new Error('创建账号失败'));

    render(<UsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: '创建账号' }));
    fireEvent.change(screen.getByPlaceholderText('例如：业务面试官'), { target: { value: '业务面试官' } });
    fireEvent.change(screen.getByPlaceholderText('user@company.com'), { target: { value: 'interviewer@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('至少 6 位'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('创建账号失败');
  });
});
