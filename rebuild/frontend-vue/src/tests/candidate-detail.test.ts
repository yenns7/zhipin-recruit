import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import CandidateDetailView from '@/views/candidates/CandidateDetailView.vue'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function candidateDetailPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 1,
      nameMasked: '张三',
      emailMasked: 'zhangsan@test.com',
      phoneMasked: '138****0001',
      parseStatus: 'parsed',
      sourceLabel: '简历上传',
      sourceDetail: '已完成简历解析，可继续安排业务初筛。',
      inPipeline: true,
      createdAt: '2026-07-07T10:00:00Z',
      latestUpdatedAt: '2026-07-08T10:00:00Z',
      pipelineStageCount: 2,
      activeJobCount: 1,
      currentStage: 'INTERVIEW',
      currentJobId: 5,
      currentJobTitle: '高级后端工程师',
      highestEducation: '本科',
      yearsOfExperience: 6,
      currentCompany: '星云科技',
      currentTitle: '高级后端工程师',
      city: '北京',
      coreSkills: ['Go', '分布式系统', '团队协作'],
      profileSummary: '负责高并发招聘平台架构设计，带过 5 人小组完成交付。',
      lastResumeParseSummary: '解析结论显示具备后端架构与团队协作经验，适合进入业务面。',
      pipelineRecords: [
        { stageId: 10, jobId: 5, jobTitle: '高级后端工程师', stage: 'SCREENING', ts: '2026-07-07T10:00:00Z' },
        { stageId: 11, jobId: 5, jobTitle: '高级后端工程师', stage: 'INTERVIEW', ts: '2026-07-08T10:00:00Z' },
      ],
      ...overrides,
    },
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/candidates/:candidateId',
      name: 'CandidateDetail',
      component: CandidateDetailView,
    },
    {
      path: '/candidates',
      name: 'Candidates',
      component: { template: '<div>候选人列表</div>' },
    },
    {
      path: '/jobs',
      name: 'Jobs',
      component: { template: '<div>岗位池</div>' },
    },
    {
      path: '/pipeline',
      name: 'Pipeline',
      component: { template: '<div>流程看板</div>' },
    },
  ],
})

describe('CandidateDetailView', () => {
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

  it('loads and displays candidate detail', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(candidateDetailPayload()))

    await router.push('/candidates/1')
    await router.isReady()

    const wrapper = mount(CandidateDetailView, {
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('zhangsan@test.com')
    expect(wrapper.text()).toContain('138****0001')
    expect(wrapper.text()).toContain('parsed')
    expect(wrapper.text()).toContain('已在流程中')
    expect(wrapper.text()).toContain('简历上传')
    expect(wrapper.text()).toContain('已完成简历解析，可继续安排业务初筛。')
    expect(wrapper.text()).toContain('共推进 2 次')
    expect(wrapper.text()).toContain('涉及 1 个岗位')
    expect(wrapper.text()).toContain('最近更新时间')
    expect(wrapper.text()).toContain('2026-07-08')
    expect(wrapper.text()).toContain('高级后端工程师')
    // INTERVIEW is mapped to 面试中 via stageLabel()
    expect(wrapper.text()).toContain('面试中')
    expect(wrapper.text()).toContain('去候选人流程看板')
    expect(wrapper.text()).toContain('查看岗位池')
    expect(wrapper.text()).toContain('简历速览')
    expect(wrapper.text()).toContain('继续推进建议')
    expect(wrapper.text()).toContain('最近解析结论')
    expect(wrapper.text()).toContain('本科')
    expect(wrapper.text()).toContain('6 年')
    expect(wrapper.text()).toContain('星云科技')
    expect(wrapper.text()).toContain('北京')
    expect(wrapper.text()).toContain('Go')
    expect(wrapper.text()).toContain('分布式系统')
    expect(wrapper.text()).toContain('负责高并发招聘平台架构设计')
    expect(wrapper.text()).toContain('解析结论显示具备后端架构与团队协作经验，适合进入业务面。')
    expect(wrapper.text()).toContain('候选人已进入面试中，建议围绕最近解析结论校准本轮评估重点。')
    expect(wrapper.text()).toContain('优先核实 Go、分布式系统 与高级后端工程师的岗位要求匹配度。')
  })

  it('shows 未入池 with empty-state guidance when candidate is not in pipeline', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(candidateDetailPayload({
      inPipeline: false,
      sourceLabel: '候选人库录入',
      sourceDetail: '当前只有基础档案，建议先确认目标岗位和推进节奏。',
      latestUpdatedAt: '2026-07-07T10:00:00Z',
      pipelineStageCount: 0,
      activeJobCount: 0,
      currentStage: null,
      currentJobId: null,
      currentJobTitle: null,
      highestEducation: null,
      yearsOfExperience: null,
      currentCompany: '',
      currentTitle: '',
      city: '',
      coreSkills: [],
      profileSummary: '',
      lastResumeParseSummary: '',
      pipelineRecords: [],
    })))

    await router.push('/candidates/2')
    await router.isReady()

    const wrapper = mount(CandidateDetailView, {
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('未入池')
    expect(wrapper.text()).toContain('候选人库录入')
    expect(wrapper.text()).toContain('当前只有基础档案，建议先确认目标岗位和推进节奏。')
    expect(wrapper.text()).toContain('该候选人还没有进入候选人流程')
    expect(wrapper.text()).toContain('可以先去招聘管理确认目标岗位')
    expect(wrapper.text()).toContain('去候选人流程看板')
    expect(wrapper.text()).toContain('查看岗位池')
    expect(wrapper.text()).toContain('简历速览')
    expect(wrapper.text()).toContain('暂无结构化简历信息')
    expect(wrapper.text()).toContain('建议先绑定目标岗位，再决定是否进入初筛流程。')
    expect(wrapper.text()).toContain('当前没有最近解析结论，建议补充简历解析或手动完善候选人亮点。')
    expect(wrapper.text()).toContain('缺少核心技能标签，建议先补充技能关键词再推进。')
  })

  it('shows error state when fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))

    await router.push('/candidates/1')
    await router.isReady()

    const wrapper = mount(CandidateDetailView, {
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Network error')
  })

  it('navigates back to list when clicking 返回', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(candidateDetailPayload()))

    await router.push('/candidates/1')
    await router.isReady()

    const wrapper = mount(CandidateDetailView, {
      global: { plugins: [router] },
    })
    await flushPromises()

    // Click the first button (返回候选人列表)
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('Candidates')
  })
})
