import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PipelineBoardView from '@/views/pipeline/PipelineBoardView.vue'

const fetchMock = vi.fn()

describe('PipelineBoardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    localStorage.setItem('hireinsight_token', 'token')
    localStorage.setItem('hireinsight_role', 'recruiter')
    localStorage.setItem('hireinsight_name', '招聘专员')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads board, shows history timeline, and submits a correction', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              jobId: 1,
              stages: {
                pending: [],
                ai_screen: [],
                business_review: [],
                interview: [
                  {
                    candidateId: 201,
                    candidateName: '林然',
                    stage: 'interview',
                    updatedAt: '2026-07-06T12:00:00Z',
                  },
                ],
                offer: [],
                onboarded: [],
                rejected: [],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000001,
            data: {
              candidateId: 201,
              candidateName: '林然',
              jobId: 1,
              currentStage: 'interview',
              historyHint: '修正只会新增事件，不会抹掉历史推进记录。',
              events: [
                {
                  eventType: 'CREATED',
                  fromStage: null,
                  toStage: 'pending',
                  reason: null,
                  note: null,
                  operatorId: 1,
                  operatorName: '招聘专员',
                  happenedAt: '2026-07-06T10:00:00Z',
                },
                {
                  eventType: 'MOVED',
                  fromStage: 'pending',
                  toStage: 'interview',
                  reason: null,
                  note: '候选人已确认时间',
                  operatorId: 1,
                  operatorName: '招聘专员',
                  happenedAt: '2026-07-06T12:00:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000002,
            data: {
              id: 301,
              eventType: 'CORRECTED',
              fromStage: 'interview',
              toStage: 'business_review',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000003,
            data: {
              jobId: 1,
              stages: {
                pending: [],
                ai_screen: [],
                business_review: [
                  {
                    candidateId: 201,
                    candidateName: '林然',
                    stage: 'business_review',
                    updatedAt: '2026-07-06T12:30:00Z',
                  },
                ],
                interview: [],
                offer: [],
                onboarded: [],
                rejected: [],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000004,
            data: {
              candidateId: 201,
              candidateName: '林然',
              jobId: 1,
              currentStage: 'business_review',
              historyHint: '修正只会新增事件，不会抹掉历史推进记录。',
              events: [
                {
                  eventType: 'CREATED',
                  fromStage: null,
                  toStage: 'pending',
                  reason: null,
                  note: null,
                  operatorId: 1,
                  operatorName: '招聘专员',
                  happenedAt: '2026-07-06T10:00:00Z',
                },
                {
                  eventType: 'MOVED',
                  fromStage: 'pending',
                  toStage: 'interview',
                  reason: null,
                  note: '候选人已确认时间',
                  operatorId: 1,
                  operatorName: '招聘专员',
                  happenedAt: '2026-07-06T12:00:00Z',
                },
                {
                  eventType: 'CORRECTED',
                  fromStage: 'interview',
                  toStage: 'business_review',
                  reason: '误推进到了面试阶段',
                  note: '先回到业务复核',
                  operatorId: 1,
                  operatorName: '招聘专员',
                  happenedAt: '2026-07-06T12:30:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(PipelineBoardView, {
      global: {
        plugins: [createPinia()],
      },
    })

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pipeline/1/board', expect.any(Object))
    expect(wrapper.text()).toContain('招聘流程')
    expect(wrapper.text()).toContain('林然')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pipeline/1/candidates/201/history', expect.any(Object))
    expect(wrapper.text()).toContain('历史事件流')
    expect(wrapper.text()).toContain('推进阶段')
    expect(wrapper.text()).toContain('候选人已确认时间')

    const select = wrapper.get('select')
    await select.setValue('business_review')
    const textareas = wrapper.findAll('textarea')
    await textareas[0].setValue('误推进到了面试阶段')
    await textareas[1].setValue('先回到业务复核')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/pipeline/revise',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          candidateId: 201,
          jobId: 1,
          toStage: 'business_review',
          reason: '误推进到了面试阶段',
          note: '先回到业务复核',
        }),
      }),
    )
    expect(wrapper.text()).toContain('当前阶段：业务评估')
    expect(wrapper.text()).toContain('纠正阶段')
    expect(wrapper.text()).toContain('误推进到了面试阶段')
  })
})
