import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const fetchMock = vi.fn()

describe('auth store self-service actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('logs in and persists token fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: 'ok',
          timestamp: Date.now(),
          data: {
            token: 'token-1',
            role: 'recruiter',
            name: '测试用户',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const store = useAuthStore()
    await store.login('user@hireinsight.com', 'Pass1234')

    expect(store.token).toBe('token-1')
    expect(store.role).toBe('recruiter')
    expect(store.name).toBe('测试用户')
    expect(localStorage.getItem('hireinsight_token')).toBe('token-1')
  })

  it('changes password through the self-service endpoint', async () => {
    localStorage.setItem('hireinsight_token', 'token-1')
    localStorage.setItem('hireinsight_role', 'recruiter')
    localStorage.setItem('hireinsight_name', '测试用户')

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: 'ok',
          timestamp: Date.now(),
          data: {
            message: 'Password updated for demo user',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const store = useAuthStore()
    const result = await store.changePassword('Pass1234', 'NewPass5678')

    expect(result.message).toBe('Password updated for demo user')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/users/me/password',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          currentPassword: 'Pass1234',
          newPassword: 'NewPass5678',
        }),
      }),
    )
  })

  it('calls logout endpoint before clearing local auth state', async () => {
    localStorage.setItem('hireinsight_token', 'token-1')
    localStorage.setItem('hireinsight_role', 'recruiter')
    localStorage.setItem('hireinsight_name', '测试用户')

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: 'ok',
          timestamp: Date.now(),
          data: {
            message: 'Logged out from demo session',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const store = useAuthStore()
    await store.logout()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      }),
    )
    expect(store.token).toBeNull()
    expect(store.role).toBeNull()
    expect(store.name).toBeNull()
    expect(localStorage.getItem('hireinsight_token')).toBeNull()
  })
})
