import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CandidateListView from '@/views/candidates/CandidateListView.vue'
import JobListView from '@/views/jobs/JobListView.vue'
import InterviewListView from '@/views/interviews/InterviewListView.vue'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildCandidates(count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
    name_masked: `候选人 ${start + index}`,
    parse_status: index % 2 === 0 ? 'ok' : 'pending',
    created_at: '2026-07-07T09:00:00Z',
  }))
}

function buildJobs(count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
    title: `岗位 ${start + index}`,
    status: index % 2 === 0 ? 'active' : 'closed',
    created_at: '2026-07-07T09:00:00Z',
  }))
}

function buildInterviews(count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
    candidate_name: `候选人 ${start + index}`,
    job_title: `岗位 ${start + index}`,
    status: index % 2 === 0 ? 'completed' : 'draft',
    score: index % 2 === 0 ? 85 + index : null,
    created_at: '2026-07-07T09:00:00Z',
  }))
}

describe('list pagination views', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach(key => delete store[key]) },
      get length() { return Object.keys(store).length },
      key: (index: number) => Object.keys(store)[index] ?? null,
    })
    localStorage.setItem('hireinsight_token', 'token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes candidate page and pageSize params, then reloads from page 1 after page size changes', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: buildCandidates(10),
          total: 24,
          page: 1,
          pageSize: 10,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: buildCandidates(5),
          total: 24,
          page: 1,
          pageSize: 5,
        }),
      )

    const wrapper = mount(CandidateListView)
    await flushPromises()

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/candidates?page=1&pageSize=10')

    await wrapper.get('[data-testid="page-size-select"]').setValue('5')
    await flushPromises()

    const latestCandidateCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(String(latestCandidateCall?.[0])).toContain('/api/v1/candidates?page=1&pageSize=5')
  })

  it('passes job page params and resets to page 1 when filters change or reset', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(buildJobs(12)))
      .mockResolvedValueOnce(jsonResponse(buildJobs(12)))
      .mockResolvedValueOnce(jsonResponse(buildJobs(12)))
      .mockResolvedValueOnce(jsonResponse(buildJobs(12)))

    const wrapper = mount(JobListView)
    await flushPromises()

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/jobs?page=1&pageSize=10')
    expect(wrapper.text()).toContain('岗位 1')
    expect(wrapper.text()).not.toContain('岗位 11')

    await wrapper.get('[data-testid="pagination-next"]').trigger('click')
    await flushPromises()

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/v1/jobs?page=2&pageSize=10')
    expect(wrapper.text()).toContain('岗位 11')

    await wrapper.get('[data-testid="job-status-filter"]').setValue('closed')
    await flushPromises()

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/api/v1/jobs?page=1&pageSize=10&status=closed')

    await wrapper.get('[data-testid="list-reset"]').trigger('click')
    await flushPromises()

    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/api/v1/jobs?page=1&pageSize=10')
    expect(String(fetchMock.mock.calls[3]?.[0])).not.toContain('status=closed')
  })

  it('passes interview page params and fetches the next page when pagination advances', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: buildInterviews(10),
          total: 21,
          page: 1,
          pageSize: 10,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: buildInterviews(10, 11),
          total: 21,
          page: 2,
          pageSize: 10,
        }),
      )

    const wrapper = mount(InterviewListView)
    await flushPromises()

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/interviews?page=1&pageSize=10')
    await wrapper.get('[data-testid="pagination-next"]').trigger('click')
    await flushPromises()

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/v1/interviews?page=2&pageSize=10')
    expect(wrapper.text()).toContain('候选人 11')
  })
})
