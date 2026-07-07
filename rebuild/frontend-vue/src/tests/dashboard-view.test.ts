import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DashboardView from '@/views/dashboard/DashboardView.vue'
import { useAuthStore } from '@/stores/auth'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DashboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      get length() { return Object.keys(store).length },
      key: (i: number) => Object.keys(store)[i] ?? null,
    })
    localStorage.setItem('hireinsight_token', 'test-token')
    localStorage.setItem('hireinsight_name', '测试专员')
    localStorage.setItem('hireinsight_role', 'recruiter')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders welcome message with role label', async () => {
    ;(fetch as any).mockResolvedValue(
      jsonResponse({ data: { activeJobs: 3, candidateTotal: 12, parsedCandidates: 8, adminOrManager: false } }),
    )
    const wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.text()).toContain('测试专员')
    expect(wrapper.text()).toContain('招聘专员')
  })

  it('renders scoped stats for recruiter', async () => {
    ;(fetch as any).mockResolvedValue(
      jsonResponse({ data: { activeJobs: 2, candidateTotal: 5, parsedCandidates: 4, adminOrManager: false } }),
    )
    const wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('4')
  })

  it('shows scope hint when recruiter has no candidates', async () => {
    ;(fetch as any).mockResolvedValue(
      jsonResponse({ data: { activeJobs: 0, candidateTotal: 0, parsedCandidates: 0, adminOrManager: false } }),
    )
    const wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.text()).toContain('上传简历')
  })

  it('does not show scope hint for admin with zero data', async () => {
    ;(fetch as any).mockResolvedValue(
      jsonResponse({ data: { activeJobs: 0, candidateTotal: 0, parsedCandidates: 0, adminOrManager: true } }),
    )
    const wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.text()).not.toContain('上传简历')
  })
})
