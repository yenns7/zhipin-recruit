import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import InterviewReportView from './InterviewReportView.vue'
import { defineComponent } from 'vue'

const DummyList = defineComponent({
  template: '<div>list</div>',
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: { template: '<router-view />' },
      children: [
        { path: 'interviews', name: 'Interviews', component: DummyList },
        {
          path: 'interviews/:interviewId',
          name: 'InterviewReport',
          component: InterviewReportView,
        },
      ],
    },
  ],
})

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildApiResponse(data: unknown) {
  return { code: 200, message: 'ok', data }
}

describe('InterviewReportView', () => {
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

  it('shows loading state then report content on success', async () => {
    const interviewData = {
      id: 1,
      candidateId: 10,
      candidateName: '李一鸣',
      jobId: 100,
      jobTitle: '高级前端工程师',
      interviewerId: 8,
      score: 4,
      passRecommended: true,
      aiReport: JSON.stringify({
        summary: '候选人表达清晰，前端工程经验与岗位高度匹配。',
        highlights: ['复杂项目拆解能力强', '能主动补充性能优化案例'],
        concerns: ['跨团队影响力案例还不够充分'],
        notes: ['建议进入终面前补充管理复杂协作冲突的案例'],
      }),
      qaJson: JSON.stringify([
        { q: '介绍一个最有挑战的项目', a: '负责重构交易中台前端架构。' },
      ]),
      createdAt: '2026-07-07T09:00:00Z',
    }
    ;(fetch as any).mockResolvedValue(jsonResponse(buildApiResponse(interviewData)))

    router.push('/interviews/1')
    await router.isReady()

    const wrapper = mount(InterviewReportView, {
      global: { plugins: [router] },
    })

    expect(wrapper.text()).toContain('加载中')

    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('面试报告')
    expect(wrapper.text()).toContain('反馈已提交')
    expect(wrapper.text()).toContain('2026-07-07')
    expect(wrapper.text()).toContain('报告摘要')
    expect(wrapper.text()).toContain('候选人表达清晰')
    expect(wrapper.text()).toContain('关键信息')
    expect(wrapper.text()).toContain('李一鸣')
    expect(wrapper.text()).toContain('高级前端工程师')
    expect(wrapper.text()).toContain('亮点')
    expect(wrapper.text()).toContain('复杂项目拆解能力强')
    expect(wrapper.text()).toContain('顾虑')
    expect(wrapper.text()).toContain('跨团队影响力案例还不够充分')
    expect(wrapper.text()).toContain('备注')
    expect(wrapper.text()).toContain('建议进入终面前补充管理复杂协作冲突的案例')
    expect(wrapper.text()).toContain('问答记录')
    expect(wrapper.text()).toContain('介绍一个最有挑战的项目')
  })

  it('shows error when interview returns null data', async () => {
    ;(fetch as any).mockResolvedValue(jsonResponse(buildApiResponse(null)))

    router.push('/interviews/999')
    await router.isReady()

    const wrapper = mount(InterviewReportView, {
      global: { plugins: [router] },
    })

    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('未找到面试记录')
  })

  it('renders passRecommended as "否" when false', async () => {
    const interviewData = {
      id: 2,
      candidateId: 11,
      jobId: 101,
      score: 2,
      passRecommended: false,
      createdAt: '2026-07-07T09:00:00Z',
    }
    ;(fetch as any).mockResolvedValue(jsonResponse(buildApiResponse(interviewData)))

    router.push('/interviews/2')
    await router.isReady()

    const wrapper = mount(InterviewReportView, {
      global: { plugins: [router] },
    })

    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('否')
  })

  it('shows clear guidance when feedback has not been submitted', async () => {
    const interviewData = {
      id: 3,
      candidateId: 12,
      candidateName: '王敏',
      jobId: 102,
      jobTitle: '招聘经理',
      interviewerId: 9,
      score: null,
      passRecommended: null,
      aiReport: '',
      qaJson: '',
      createdAt: '2026-07-07T09:00:00Z',
    }
    ;(fetch as any).mockResolvedValue(jsonResponse(buildApiResponse(interviewData)))

    router.push('/interviews/3')
    await router.isReady()

    const wrapper = mount(InterviewReportView, {
      global: { plugins: [router] },
    })

    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('反馈待提交')
    expect(wrapper.text()).toContain('面试官尚未提交反馈')
    expect(wrapper.text()).toContain('请尽快完成评分、结论与备注')
  })
})
