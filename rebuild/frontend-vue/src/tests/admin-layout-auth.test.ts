import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'

const push = vi.fn()
const fetchMock = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push }),
    useRoute: () => ({
      path: '/',
      meta: { title: '工作台' },
    }),
  }
})

describe('AdminLayout auth self-service', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock.mockReset()
    push.mockReset()
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem('hireinsight_token', 'token-1')
    localStorage.setItem('hireinsight_role', 'recruiter')
    localStorage.setItem('hireinsight_name', '测试用户')
  })

  it('submits password change from the self-service panel', async () => {
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

    const wrapper = mount(AdminLayout, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
          RouterView: {
            template: '<div />',
          },
        },
      },
    })

    await wrapper.get('[data-test="toggle-password-panel"]').trigger('click')
    await wrapper.get('[data-test="current-password"]').setValue('Pass1234')
    await wrapper.get('[data-test="new-password"]').setValue('NewPass5678')
    await wrapper.get('[data-test="submit-password"]').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/users/me/password',
      expect.objectContaining({
        method: 'PUT',
      }),
    )
    expect(wrapper.text()).toContain('密码已更新，可继续使用当前 demo 会话')
  })

  it('logs out through backend endpoint and redirects to login', async () => {
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

    const wrapper = mount(AdminLayout, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
          RouterView: {
            template: '<div />',
          },
        },
      },
    })

    await wrapper.get('[data-test="logout"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(push).toHaveBeenCalledWith('/login')
  })
})
