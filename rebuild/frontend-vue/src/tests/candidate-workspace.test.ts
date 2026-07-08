import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CandidateListView from '@/views/candidates/CandidateListView.vue'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('CandidateListView - scope awareness', () => {
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

  it('shows scope-aware empty state when no candidates', async () => {
    ;(fetch as any).mockResolvedValue(jsonResponse([]))
    const wrapper = mount(CandidateListView)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无候选人数据')
    expect(wrapper.text()).toContain('上传简历')
    expect(wrapper.text()).toContain('真实写入 Java rebuild 的 PostgreSQL dev 数据库')
  })

  it('renders candidate list when data exists', async () => {
    ;(fetch as any).mockResolvedValue(
      jsonResponse([
        { id: 1, name_masked: '张三', parse_status: 'parsed', created_at: '2026-07-07T09:00:00Z' },
      ]),
    )
    const wrapper = mount(CandidateListView)
    await flushPromises()
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('parsed')
    expect(wrapper.text()).toContain('真实写入 Java rebuild 的 PostgreSQL dev 数据库')
  })
})
