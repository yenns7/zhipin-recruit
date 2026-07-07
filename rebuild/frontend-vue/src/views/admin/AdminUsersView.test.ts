import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminUsersView from '@/views/admin/AdminUsersView.vue'

const fetchMock = vi.fn()

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    code: status,
    message: status === 200 ? 'ok' : 'error',
    timestamp: Date.now(),
    data,
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AdminUsersView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach(key => delete store[key]) },
      get length() { return Object.keys(store).length },
      key: (index: number) => Object.keys(store)[index] ?? null,
    })
    localStorage.clear()
    localStorage.setItem('hireinsight_token', 'token')
    localStorage.setItem('hireinsight_role', 'admin')
    localStorage.setItem('hireinsight_name', '系统管理员')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the admin user governance shell', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const wrapper = mount(AdminUsersView, {
      global: {
        plugins: [createPinia()],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('用户治理')
    expect(wrapper.text()).toContain('创建试点账号')
  })

  it('loads users and supports creating a pilot account', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 11,
          name: 'Recruiter Demo',
          email: 'recruiter-demo@test.com',
          role: 'recruiter',
          active: true,
          createdAt: '2026-07-06T11:30:00Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        id: 12,
        name: 'Interviewer Demo',
        email: 'interviewer-demo@test.com',
        role: 'interviewer',
        active: true,
        createdAt: '2026-07-07T09:00:00Z',
      }))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 11,
          name: 'Recruiter Demo',
          email: 'recruiter-demo@test.com',
          role: 'recruiter',
          active: true,
          createdAt: '2026-07-06T11:30:00Z',
        },
        {
          id: 12,
          name: 'Interviewer Demo',
          email: 'interviewer-demo@test.com',
          role: 'interviewer',
          active: true,
          createdAt: '2026-07-07T09:00:00Z',
        },
      ]))

    const wrapper = mount(AdminUsersView)

    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/admin/users', expect.any(Object))
    expect(wrapper.text()).toContain('Recruiter Demo')
    await wrapper.get('[data-testid="create-name"]').setValue('Interviewer Demo')
    await wrapper.get('[data-testid="create-email"]').setValue('interviewer-demo@test.com')
    await wrapper.get('[data-testid="create-role"]').setValue('interviewer')
    await wrapper.get('[data-testid="create-password"]').setValue('NewPass5678')
    await wrapper.get('[data-testid="create-active"]').setValue(true)
    await wrapper.get('[data-testid="create-form"]').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/admin/users', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: 'Interviewer Demo',
        email: 'interviewer-demo@test.com',
        role: 'interviewer',
        password: 'NewPass5678',
        active: true,
      }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/admin/users', expect.any(Object))
    expect(wrapper.text()).toContain('已创建账号：Interviewer Demo')
    expect(wrapper.text()).toContain('Interviewer Demo')
  })

  it('supports editing a user with patch contract and refreshes the user list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 12,
          name: 'Manager Demo',
          email: 'manager-demo@test.com',
          role: 'recruiter',
          active: true,
          createdAt: '2026-07-06T11:30:00Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        id: 12,
        name: 'Hiring Manager Demo',
        email: 'manager-demo@test.com',
        role: 'manager',
        active: false,
        createdAt: '2026-07-06T11:30:00Z',
      }))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 12,
          name: 'Hiring Manager Demo',
          email: 'manager-demo@test.com',
          role: 'manager',
          active: false,
          createdAt: '2026-07-06T11:30:00Z',
        },
      ]))

    const wrapper = mount(AdminUsersView)

    await flushPromises()
    await wrapper.get('[data-testid="edit-user-12"]').trigger('click')
    await wrapper.get('[data-testid="edit-name-12"]').setValue('Hiring Manager Demo')
    await wrapper.get('[data-testid="edit-role-12"]').setValue('manager')
    await wrapper.get('[data-testid="edit-active-12"]').setValue(false)
    await wrapper.get('[data-testid="edit-form-12"]').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/admin/users/12', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Hiring Manager Demo',
        role: 'manager',
        active: false,
      }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/admin/users', expect.any(Object))
    expect(wrapper.text()).toContain('已更新账号：Hiring Manager Demo')
    expect(wrapper.text()).toContain('已停用')
  })

  it('supports reset password without exposing the new password in the feedback', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 13,
          name: 'Recruiter Demo',
          email: 'recruiter-demo@test.com',
          role: 'recruiter',
          active: true,
          createdAt: '2026-07-06T11:30:00Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        message: '已重置密码：Recruiter Demo',
      }))

    const wrapper = mount(AdminUsersView)

    await flushPromises()
    await wrapper.get('[data-testid="reset-password-13"]').trigger('click')
    await wrapper.get('[data-testid="reset-password-input-13"]').setValue('ResetPass5678')
    await wrapper.get('[data-testid="reset-password-form-13"]').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/admin/users/13/reset-password', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        newPassword: 'ResetPass5678',
      }),
    }))
    expect(wrapper.text()).toContain('已重置密码：Recruiter Demo')
    expect(wrapper.text()).not.toContain('ResetPass5678')
  })
})
