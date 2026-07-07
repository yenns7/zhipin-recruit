import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import router from '@/router'
import SystemAdminView from '@/views/admin/SystemAdminView.vue'

const fetchMock = vi.fn()

describe('SystemAdminView', () => {
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
    localStorage.setItem('hireinsight_role', 'admin')
    localStorage.setItem('hireinsight_name', '系统管理员')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers admin system route and shows nav entry for admin users', async () => {
    expect(router.resolve('/admin/system').name).toBe('AdminSystem')

    await router.push('/')
    await router.isReady()

    const wrapper = mount(
      defineComponent({
        template: '<router-view />',
      }),
      {
        global: {
          plugins: [createPinia(), router],
        },
      },
    )

    await flushPromises()

    expect(wrapper.text()).toContain('系统设置')
  })

  it('loads system overview and audit logs for admin users', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              generatedAt: '2026-07-06T11:30:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              parameterSummary: {
                totalCount: 4,
                mutableCount: 2,
                entries: [
                  {
                    key: 'security.sessionTimeoutMinutes',
                    label: '后台会话超时',
                    value: '120 分钟',
                    category: 'security',
                    exposure: 'admin_readonly_demo',
                    mutable: false,
                  },
                  {
                    key: 'audit.manualReviewEnabled',
                    label: '审核人工复核',
                    value: '关闭',
                    category: 'audit',
                    exposure: 'admin_demo_write',
                    mutable: true,
                  },
                ],
              },
              modelSummary: {
                totalCount: 3,
                rolloutMode: 'demo-shadow',
                entries: [
                  {
                    id: 'resume-parser-primary',
                    provider: 'OpenAI',
                    model: 'gpt-4.1-mini',
                    scenario: '简历解析 / 总结',
                    status: 'active',
                    fallbackModel: 'gpt-4o-mini',
                    note: '当前仅展示摘要，不落真实供应商密钥。',
                    mutable: false,
                  },
                  {
                    id: 'interview-question-generator',
                    provider: 'OpenAI',
                    model: 'gpt-4.1',
                    scenario: '面试问题生成',
                    status: 'standby',
                    fallbackModel: 'gpt-4.1-mini',
                    note: '仅供管理员查看 demo 策略卡片。',
                    mutable: true,
                  },
                ],
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
              generatedAt: '2026-07-06T11:30:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              total: 2,
              items: [
                {
                  id: 'audit-20260706-004',
                  action: 'MODEL_CONFIG_REVIEWED',
                  actorName: '系统管理员',
                  actorRole: 'admin',
                  targetType: 'model',
                  targetName: 'gpt-4.1-mini / resume-parser',
                  result: 'success',
                  detail: '确认 demo 环境继续使用影子发布卡片，仅前台只读展示。',
                  happenedAt: '2026-07-06T10:40:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(SystemAdminView)

    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/admin/system/overview', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/admin/system/audit-logs', expect.any(Object))
    expect(wrapper.text()).toContain('系统设置')
    expect(wrapper.text()).toContain('仅用于 demo / in-memory 展示')
    expect(wrapper.text()).toContain('后台会话超时')
    expect(wrapper.text()).toContain('gpt-4.1-mini')
    expect(wrapper.text()).toContain('MODEL_CONFIG_REVIEWED')
    expect(wrapper.text()).toContain('切换为开启')
    expect(wrapper.text()).toContain('切换为 active')
  })

  it('submits parameter toggle and refreshes overview and audit logs', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              generatedAt: '2026-07-06T11:30:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              parameterSummary: {
                totalCount: 4,
                mutableCount: 2,
                entries: [
                  {
                    key: 'audit.manualReviewEnabled',
                    label: '审核人工复核',
                    value: '关闭',
                    category: 'audit',
                    exposure: 'admin_demo_write',
                    mutable: true,
                  },
                ],
              },
              modelSummary: {
                totalCount: 3,
                rolloutMode: 'demo-shadow',
                entries: [
                  {
                    id: 'interview-question-generator',
                    provider: 'OpenAI',
                    model: 'gpt-4.1',
                    scenario: '面试问题生成',
                    status: 'standby',
                    fallbackModel: 'gpt-4.1-mini',
                    note: '仅供管理员查看 demo 策略卡片。',
                    mutable: true,
                  },
                ],
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
              generatedAt: '2026-07-06T11:30:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              total: 1,
              items: [],
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
              generatedAt: '2026-07-06T11:31:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              message: '已切换参数：审核人工复核',
              targetType: 'parameter',
              targetName: 'audit.manualReviewEnabled',
              currentValue: '开启',
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
              generatedAt: '2026-07-06T11:31:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              parameterSummary: {
                totalCount: 4,
                mutableCount: 2,
                entries: [
                  {
                    key: 'audit.manualReviewEnabled',
                    label: '审核人工复核',
                    value: '开启',
                    category: 'audit',
                    exposure: 'admin_demo_write',
                    mutable: true,
                  },
                ],
              },
              modelSummary: {
                totalCount: 3,
                rolloutMode: 'demo-shadow',
                entries: [
                  {
                    id: 'interview-question-generator',
                    provider: 'OpenAI',
                    model: 'gpt-4.1',
                    scenario: '面试问题生成',
                    status: 'standby',
                    fallbackModel: 'gpt-4.1-mini',
                    note: '仅供管理员查看 demo 策略卡片。',
                    mutable: true,
                  },
                ],
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
              generatedAt: '2026-07-06T11:31:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              total: 2,
              items: [
                {
                  id: 'audit-20260706-005',
                  action: 'SYSTEM_PARAMETER_TOGGLED',
                  actorName: '系统管理员',
                  actorRole: 'admin',
                  targetType: 'parameter',
                  targetName: 'audit.manualReviewEnabled',
                  result: 'success',
                  detail: '将审核人工复核从关闭切换为开启（demo / in-memory）。',
                  happenedAt: '2026-07-06T11:31:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(SystemAdminView)
    await flushPromises()

    await wrapper.get('[data-testid="toggle-parameter-audit.manualReviewEnabled"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/admin/system/parameters/audit.manualReviewEnabled/toggle',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/admin/system/overview', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/v1/admin/system/audit-logs', expect.any(Object))
    expect(wrapper.text()).toContain('已切换参数：审核人工复核')
    expect(wrapper.text()).toContain('开启')
    expect(wrapper.text()).toContain('SYSTEM_PARAMETER_TOGGLED')
  })

  it('submits model toggle and shows refreshed status', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              generatedAt: '2026-07-06T11:30:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              parameterSummary: { totalCount: 4, mutableCount: 2, entries: [] },
              modelSummary: {
                totalCount: 3,
                rolloutMode: 'demo-shadow',
                entries: [
                  {
                    id: 'interview-question-generator',
                    provider: 'OpenAI',
                    model: 'gpt-4.1',
                    scenario: '面试问题生成',
                    status: 'standby',
                    fallbackModel: 'gpt-4.1-mini',
                    note: '仅供管理员查看 demo 策略卡片。',
                    mutable: true,
                  },
                ],
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
              generatedAt: '2026-07-06T11:30:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              total: 1,
              items: [],
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
              generatedAt: '2026-07-06T11:32:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              message: '已切换模型状态：gpt-4.1',
              targetType: 'model',
              targetName: 'interview-question-generator',
              currentValue: 'active',
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
              generatedAt: '2026-07-06T11:32:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              parameterSummary: { totalCount: 4, mutableCount: 2, entries: [] },
              modelSummary: {
                totalCount: 3,
                rolloutMode: 'demo-shadow',
                entries: [
                  {
                    id: 'interview-question-generator',
                    provider: 'OpenAI',
                    model: 'gpt-4.1',
                    scenario: '面试问题生成',
                    status: 'active',
                    fallbackModel: 'gpt-4.1-mini',
                    note: '仅供管理员查看 demo 策略卡片。',
                    mutable: true,
                  },
                ],
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
              generatedAt: '2026-07-06T11:32:00Z',
              demoNotice: '仅用于 demo / in-memory 展示，不代表真实持久化配置。',
              total: 2,
              items: [
                {
                  id: 'audit-20260706-005',
                  action: 'MODEL_STATUS_TOGGLED',
                  actorName: '系统管理员',
                  actorRole: 'admin',
                  targetType: 'model',
                  targetName: 'interview-question-generator',
                  result: 'success',
                  detail: '将模型 gpt-4.1 的状态从standby切换为active（demo / in-memory）。',
                  happenedAt: '2026-07-06T11:32:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(SystemAdminView)
    await flushPromises()

    await wrapper.get('[data-testid="toggle-model-interview-question-generator"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/admin/system/models/interview-question-generator/toggle-status',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('已切换模型状态：gpt-4.1')
    expect(wrapper.text()).toContain('active')
    expect(wrapper.text()).toContain('MODEL_STATUS_TOGGLED')
  })

  it('redirects recruiter away from admin system route', async () => {
    localStorage.setItem('hireinsight_role', 'recruiter')

    await router.push('/admin/system')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
