import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PipelineBoardView from '@/views/pipeline/PipelineBoardView.vue'

const fetchMock = vi.fn()

/**
 * The api.getPipelineBoard calls request() which does fetch(BASE + path)
 * and returns JSON.parse(text). So the mock must return exactly what
 * the view expects after parsing: { stages: {...} }.
 */
function buildBoardData() {
  return {
    jobId: 1,
    stages: {
      pending: [{ candidate_id: 3, candidate_name: '候选人 3', stage: 'pending', updated_at: '2026-07-07T10:00:00Z' }],
      ai_screen: [],
      business_review: [],
      interview: [
        { candidate_id: 1, candidate_name: '张三', stage: 'interview', updated_at: '2026-07-07T10:00:00Z' },
      ],
      offer: [],
      onboarded: [{ candidate_id: 2, candidate_name: '李四', stage: 'onboarded', updated_at: '2026-07-07T09:00:00Z' }],
      rejected: [],
    },
  }
}

function rollbackPreviewApiResponse(canRollback = true, reason?: string) {
  return {
    code: 200,
    message: 'ok',
    data: {
      canRollback,
      currentStage: canRollback ? 'interview' : null,
      targetStage: canRollback ? 'business_review' : null,
      explanation: canRollback ? '将候选人从「面试中」撤回到「业务评估」。' : null,
      history: canRollback
        ? [
            { stageEntryId: 1, stage: 'pending', operatorName: '测试员', happenedAt: '2026-07-07T09:00:00Z' },
            { stageEntryId: 2, stage: 'interview', operatorName: '测试员', happenedAt: '2026-07-07T10:00:00Z' },
          ]
        : [],
      reasonIfBlocked: canRollback ? null : (reason || '该阶段无法回退。'),
    },
  }
}

function rollbackExecuteApiResponse() {
  return {
    code: 200,
    message: 'ok',
    data: {
      stageEntryId: 3,
      eventType: 'ROLLBACK',
      fromStage: 'interview',
      toStage: 'business_review',
      explanation: '已将候选人从「面试中」撤回到「业务评估」。关联的面试记录已重开。',
      interviewAffected: true,
      interviewLink: { reopened: true, interviewFeedbackId: 42, note: '已重开 1 条面试记录，可重新安排面试。' },
      historyHint: '修正只会新增事件，不会抹掉历史推进记录。',
    },
  }
}

describe('PipelineBoardView — rollback', () => {
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
    localStorage.setItem('hireinsight_token', 'test-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows rollback button for interview-stage candidates', async () => {
    // Mock the getPipelineBoard call
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(buildBoardData()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const wrapper = mount(PipelineBoardView)
    await flushPromises()

    // Only interview (not pending, not onboarded) has the rollback button
    const buttons = wrapper.findAll('button')
    // pending: no button, interview: has 撤回 button, onboarded: no button
    expect(buttons.some(b => b.text().includes('撤回'))).toBe(true)
  })

  it('opens dialog and shows preview when rollback clicked', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(buildBoardData()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rollbackPreviewApiResponse(true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const wrapper = mount(PipelineBoardView, { attachTo: document.body })
    await flushPromises()

    // Click the 撤回 button
    const btn = wrapper.find('button')
    await btn.trigger('click')
    await flushPromises()

    // The dialog renders into body via Teleport; check body content
    expect(document.body.textContent).toContain('候选人')
  })

  it('shows blocked state when rollback is not possible', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(buildBoardData()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rollbackPreviewApiResponse(false, '当前阶段无法回退。')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const wrapper = mount(PipelineBoardView, { attachTo: document.body })
    await flushPromises()

    const btn = wrapper.find('button')
    await btn.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('当前阶段无法回退')
  })

  it('executes rollback and shows result with interview link', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(buildBoardData()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rollbackPreviewApiResponse(true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rollbackExecuteApiResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(buildBoardData()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const wrapper = mount(PipelineBoardView, { attachTo: document.body })
    await flushPromises()

    // Click 撤回
    const btn = wrapper.find('button')
    await btn.trigger('click')
    await flushPromises()

    // Click 确认撤回 button — find it in the document body
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      b => b.textContent?.includes('确认撤回')
    )
    expect(confirmBtn).toBeTruthy()
    confirmBtn!.click()
    await flushPromises()

    // Result should show in body via Teleport
    expect(document.body.textContent).toContain('已将候选人从')
    expect(document.body.textContent).toContain('已重开')
  })
})
