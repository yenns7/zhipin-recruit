import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MatchRecommendationsView from '@/views/match/MatchRecommendationsView.vue'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('MatchRecommendationsView - scope awareness', () => {
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

  it('renders scope description text', async () => {
    // Mock both job and candidate list endpoints
    ;(fetch as any)
      .mockResolvedValueOnce(jsonResponse({ data: { items: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { items: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { recommendations: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { recommendations: [] } }))

    const wrapper = mount(MatchRecommendationsView)
    await flushPromises()
    expect(wrapper.text()).toContain('数据范围说明')
    expect(wrapper.text()).toContain('招聘专员')
  })
})
