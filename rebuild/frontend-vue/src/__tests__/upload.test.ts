import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ResumeUploadView from '@/views/upload/ResumeUploadView.vue'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function advancePolling(ms: number) {
  vi.advanceTimersByTime(ms)
  await flushPromises()
  await nextTick()
}

describe('resume upload flow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
    localStorage.setItem('hireinsight_role', 'recruiter')
    localStorage.setItem('hireinsight_name', '招聘专员')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uploads selected files and renders returned results', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      batch_id: 12,
      total: 1,
      results: [{ file: 'alice.pdf', status: 'PARSED', candidate_id: 18 }],
    }, 202))

    const wrapper = mount(ResumeUploadView)
    const input = wrapper.get('input[type="file"]')
    const file = new File(['resume'], 'alice.pdf', { type: 'application/pdf' })

    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
    await wrapper.get('button[data-testid="upload-submit"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/resumes/upload')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    expect(wrapper.text()).toContain('alice.pdf')
    expect(wrapper.text()).toContain('上传完成')
    expect(wrapper.text()).toContain('候选人 ID 18')
  })

  it('automatically polls queued upload tasks after upload', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        batch_id: 12,
        total: 1,
        results: [{ file: 'alice.pdf', status: 'PENDING', task_id: 'task-1' }],
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        file: 'alice.pdf',
        status: 'PROCESSING',
        task_id: 'task-1',
      }))

    const wrapper = mount(ResumeUploadView)
    const input = wrapper.get('input[type="file"]')
    const file = new File(['resume'], 'alice.pdf', { type: 'application/pdf' })

    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
    await wrapper.get('button[data-testid="upload-submit"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advancePolling(2000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/resumes/tasks/task-1')
    expect(wrapper.text()).toContain('处理中')
  })

  it('stops polling once a task reaches a terminal status and renders the terminal state', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        batch_id: 12,
        total: 1,
        results: [{ file: 'alice.pdf', status: 'PENDING', task_id: 'task-1' }],
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        file: 'alice.pdf',
        status: 'PROCESSING',
        task_id: 'task-1',
      }))
      .mockResolvedValueOnce(jsonResponse({
        file: 'alice.pdf',
        status: 'PARSED',
        task_id: 'task-1',
        candidate_id: 18,
      }))

    const wrapper = mount(ResumeUploadView)
    const input = wrapper.get('input[type="file"]')
    const file = new File(['resume'], 'alice.pdf', { type: 'application/pdf' })

    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
    await wrapper.get('button[data-testid="upload-submit"]').trigger('click')
    await flushPromises()
    await nextTick()

    await advancePolling(2000)
    await advancePolling(2000)

    expect(wrapper.text()).toContain('解析完成')
    expect(wrapper.text()).toContain('候选人 ID 18')

    const callCountAtTerminal = fetchMock.mock.calls.length
    await advancePolling(8000)
    expect(fetchMock).toHaveBeenCalledTimes(callCountAtTerminal)
  })

  it('shows a clear empty hint before files are selected', () => {
    const wrapper = mount(ResumeUploadView)
    expect(wrapper.text()).toContain('拖拽文件到这里，或点击选择简历')
    expect(wrapper.text()).toContain('暂未选择文件')
  })
})
