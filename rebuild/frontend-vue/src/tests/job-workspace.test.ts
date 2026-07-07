import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import JobListView from '@/views/jobs/JobListView.vue'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('JobListView - scope awareness', () => {
  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows scope-aware empty state when no jobs', async () => {
    ;(fetch as any).mockResolvedValue(jsonResponse([]))
    const wrapper = mount(JobListView)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无岗位数据')
    expect(wrapper.text()).toContain('联系管理员')
  })

  it('renders job list when data exists', async () => {
    ;(fetch as any).mockResolvedValue(
      jsonResponse([
        { id: 1, title: '高级前端工程师', status: 'active', created_at: '2026-07-07T09:00:00Z' },
      ]),
    )
    const wrapper = mount(JobListView)
    await flushPromises()
    expect(wrapper.text()).toContain('高级前端工程师')
    expect(wrapper.text()).toContain('招聘中')
  })
})
