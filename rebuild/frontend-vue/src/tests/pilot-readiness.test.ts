import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import router from '@/router'
import CandidateListView from '@/views/candidates/CandidateListView.vue'
import DashboardView from '@/views/dashboard/DashboardView.vue'
import InterviewListView from '@/views/interviews/InterviewListView.vue'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setLocalStorage(role: string, name = '试点用户') {
  const store: Record<string, string> = {
    hireinsight_token: 'token',
    hireinsight_role: role,
    hireinsight_name: name,
  }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(key => delete store[key]) },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  })
}

describe('pilot readiness paths', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers upload route so recruiters can import resumes from empty states', () => {
    expect(router.resolve('/upload').name).toBe('ResumeUpload')
  })

  it('lets recruiters add an existing candidate into the pipeline with a visible recovery path', async () => {
    setLocalStorage('recruiter', '招聘专员')
    fetchMock
      .mockResolvedValueOnce(jsonResponse([
        { id: 12, name_masked: '林然', parse_status: 'parsed', created_at: '2026-07-07T09:00:00Z' },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { id: 3, title: 'Java 后端工程师', status: 'active', created_at: '2026-07-07T09:00:00Z' },
      ]))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'ok', data: { id: 99, stage: 'ai_screen' } }))

    const wrapper = mount(CandidateListView, {
      global: {
        plugins: [createPinia(), router],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('加入流程')
    await wrapper.get('[data-testid="open-add-to-pipeline-12"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/jobs?page=1&pageSize=50&status=active', expect.any(Object))
    await wrapper.get('[data-testid="pipeline-job-select"]').setValue('3')
    await wrapper.get('[data-testid="submit-add-to-pipeline"]').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/pipeline/move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          candidateId: 12,
          jobId: 3,
          toStage: 'ai_screen',
        }),
      }),
    )
    expect(wrapper.text()).toContain('已将林然加入 Java 后端工程师 的 AI 初筛')
    expect(wrapper.text()).toContain('误推进后可去候选人流程看板查看历史并纠正')
  })

  it('shows manager team trial cues for ownership, performance, and bottlenecks', async () => {
    setLocalStorage('manager', '招聘负责人')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 200,
        message: 'ok',
        data: { activeJobs: 4, candidateTotal: 18, parsedCandidates: 15, adminOrManager: true },
      }),
    )

    const wrapper = mount(DashboardView, {
      global: {
        plugins: [createPinia(), router],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('团队看板')
    expect(wrapper.text()).toContain('岗位进展')
    expect(wrapper.text()).toContain('招聘专员绩效')
    expect(wrapper.text()).toContain('流程卡点')
  })

  it('lets recruiters schedule an interview and tells interviewers what to do when empty', async () => {
    setLocalStorage('recruiter', '招聘专员')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, page: 1, pageSize: 10 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 201,
        message: 'created',
        data: { id: 31, status: 'draft' },
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, page: 1, pageSize: 10 }))

    const wrapper = mount(InterviewListView, {
      global: {
        plugins: [createPinia(), router],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('安排面试')
    expect(wrapper.text()).toContain('如果选不到候选人、岗位或面试官')

    await wrapper.get('[data-testid="schedule-candidate-id"]').setValue('12')
    await wrapper.get('[data-testid="schedule-job-id"]').setValue('3')
    await wrapper.get('[data-testid="schedule-interviewer-id"]').setValue('7')
    await wrapper.get('[data-testid="schedule-interview"]').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/interviews/schedule',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          candidateId: 12,
          jobId: 3,
          interviewerId: 7,
        }),
      }),
    )
    expect(wrapper.text()).toContain('已安排面试 #31')
  })
})
