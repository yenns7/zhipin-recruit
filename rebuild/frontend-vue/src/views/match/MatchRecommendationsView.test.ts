import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'

vi.mock('@/views/pipeline/PipelineBoardView.vue', () => ({
  default: defineComponent({
    template: '<div>Pipeline Stub</div>',
  }),
}))

import MatchRecommendationsView from '@/views/match/MatchRecommendationsView.vue'

const fetchMock = vi.fn()

describe('match recommendations view', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals()
  })

  it('loads job-side and candidate-side recommendation demos', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              items: [
                { id: 101, title: '高级前端工程师', status: 'active', targetCandidateCount: 3 },
                { id: 102, title: '招聘产品经理', status: 'active', targetCandidateCount: 2 },
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
            timestamp: 1720000001,
            data: {
              job: { id: 101, title: '高级前端工程师', status: 'active' },
              recommendations: [
                {
                  candidateId: 201,
                  candidateName: '林然',
                  currentStage: 'AI 初筛通过',
                  score: 78,
                  reasons: [
                    '岗位重点是 Vue 3、TypeScript 和招聘工作台交付，林然做过招聘工作台与组件库项目，上手会更快',
                    '候选人当前已完成 AI 初筛，适合尽快进入业务判断',
                    '林然已经在其他岗位流程中推进，本次分数做了回调，避免重复消耗候选人',
                  ],
                  nextAction: '建议招聘专员先确认候选人的岗位优先级和可转岗意愿，再安排 30 分钟业务初筛',
                },
              ],
              generatedAt: '2026-07-06T12:00:00Z',
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
              items: [
                { id: 201, name: '林然', currentStage: 'AI 初筛通过' },
                { id: 202, name: '周宁', currentStage: '待安排面试' },
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
            timestamp: 1720000003,
            data: {
              candidate: { id: 201, name: '林然', currentStage: 'AI 初筛通过' },
              recommendations: [
                {
                  jobId: 101,
                  jobTitle: '高级前端工程师',
                  status: 'active',
                  score: 78,
                  reasons: [
                    '这个岗位最缺能快速接手招聘工作台的前端同学，和林然的最近项目最贴近',
                    '岗位在北京协作、节奏偏快，和林然当前求职节奏基本匹配',
                    '林然还在其他岗位流程中，推荐分会下调一些，避免团队重复推进',
                  ],
                  nextAction: '建议先确认候选人是否愿意优先看前端岗位，再进入业务面',
                },
              ],
              generatedAt: '2026-07-06T12:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(MatchRecommendationsView)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(wrapper.text()).toContain('岗位推荐候选人')
    expect(wrapper.text()).toContain('高级前端工程师')
    expect(wrapper.text()).toContain('林然')
    expect(wrapper.text()).toContain('已经在其他岗位流程中推进，本次分数做了回调')
    expect(wrapper.text()).toContain('建议招聘专员先确认候选人的岗位优先级')
    expect(wrapper.text()).toContain('候选人匹配岗位')
    expect(wrapper.text()).toContain('建议先确认候选人是否愿意优先看前端岗位')
  })

  it('renders explainable-rule guidance copy', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: { items: [] },
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
            data: { items: [] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(MatchRecommendationsView)
    await flushPromises()

    expect(wrapper.text()).toContain('匹配推荐可解释规则演示')
    expect(wrapper.text()).toContain('帮助在重构版里展示“岗位看到推荐候选人，候选人看到匹配岗位”的可解释推荐闭环')
    expect(wrapper.text()).toContain('推荐分会结合岗位信息、候选人背景和当前流程状态生成，不会触发任何 AI 写操作')
  })
})
