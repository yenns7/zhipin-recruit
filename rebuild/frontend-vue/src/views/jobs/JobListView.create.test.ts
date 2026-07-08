import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import JobListView from '@/views/jobs/JobListView.vue'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildApiResponse(data: unknown) {
  return { code: 200, message: 'ok', data }
}

describe('JobListView - create job entry', () => {
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
    localStorage.setItem('hireinsight_token', 'token')
    localStorage.setItem('hireinsight_role', 'recruiter')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows create job entry for recruiter and creates a job', async () => {
    // First call: list jobs (empty). Second call: create job -> {id:42}. Third call: reload list.
    ;(fetch as any)
      .mockResolvedValueOnce(jsonResponse(buildApiResponse([])))
      .mockResolvedValueOnce(jsonResponse(buildApiResponse({ id: 42 })))
      .mockResolvedValueOnce(jsonResponse(buildApiResponse([])))

    const wrapper = mount(JobListView)
    await flushPromises()

    // Recruiter sees the create-job toggle.
    const toggle = wrapper.find('[data-testid="toggle-create-job"]')
    expect(toggle.exists()).toBe(true)

    // Form is hidden by default.
    expect(wrapper.find('[data-testid="create-job-form"]').exists()).toBe(false)

    // Show the form.
    await toggle.trigger('click')
    const form = wrapper.find('[data-testid="create-job-form"]')
    expect(form.exists()).toBe(true)

    // Fill in the form.
    await wrapper.find('[data-testid="job-title"]').setValue('高级前端工程师')
    await wrapper.find('[data-testid="job-jd"]').setValue('负责 Vue3 组件库')

    // Submit.
    await form.trigger('submit')
    await flushPromises()

    // POST to /api/v1/jobs with the right body.
    const createCall = (fetch as any).mock.calls.find(
      (c: any[]) => String(c[0]).includes('/api/v1/jobs') && c[1]?.method === 'POST',
    )
    expect(createCall).toBeTruthy()
    expect(createCall[0]).toBe('/api/v1/jobs')
    expect(createCall[1].method).toBe('POST')
    expect(createCall[1].body).toBe(JSON.stringify({ title: '高级前端工程师', jdText: '负责 Vue3 组件库' }))

    // Success message contains the new job id.
    expect(wrapper.text()).toContain('#42')

    // Form is hidden again after success.
    expect(wrapper.find('[data-testid="create-job-form"]').exists()).toBe(false)

    // List reload triggered: a 2nd GET to /api/v1/jobs after the create.
    const getCalls = (fetch as any).mock.calls.filter(
      (c: any[]) => String(c[0]).includes('/api/v1/jobs') && (c[1]?.method === undefined || c[1]?.method === 'GET'),
    )
    expect(getCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('hides create form for interviewer', async () => {
    localStorage.setItem('hireinsight_role', 'interviewer')
    ;(fetch as any).mockResolvedValue(jsonResponse(buildApiResponse([])))

    const wrapper = mount(JobListView)
    await flushPromises()

    expect(wrapper.find('[data-testid="toggle-create-job"]').exists()).toBe(false)
  })
})
