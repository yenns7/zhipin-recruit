import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BiInsightsView from '@/views/bi/BiInsightsView.vue'
import applicationYml from '../../../../rebuild/backend-java/src/main/resources/application.yml?raw'
import report from '../../../../docs/15_JavaSpringBootVue重构MVP状态报告.md?raw'
import backendReadme from '../../../../rebuild/backend-java/README.md?raw'

const fetchMock = vi.fn()

describe('system admin and BI copy contract', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders BI copy that separates local H2 persistence from demo limitations', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: 'ok',
          timestamp: 1720000000,
          data: {
            generatedAt: '2026-07-06T11:30:00Z',
            summary: [
              {
                key: 'pending_tasks',
                label: '今日待处理',
                value: 8,
                trend: '+2 较昨日',
                trendDirection: 'up',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const wrapper = mount(BiInsightsView)

    await Promise.resolve()
    await Promise.resolve()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/bi/overview', expect.any(Object))
    expect(wrapper.text()).toContain('本地 H2 文件库保存演示状态')
    expect(wrapper.text()).toContain('rule-based 聚合')
    expect(wrapper.text()).toContain('未接真实第三方渠道')
    expect(wrapper.text()).toContain('未接真实配置中心')
  })

  it('documents system governance as locally persisted H2 state instead of pure in-memory config', () => {
    expect(applicationYml).toContain('jdbc:h2:file:./data/hireinsight-demo')
    expect(report).toContain('系统治理参数/模型/审计日志、通知待办覆盖状态、集成账号/扩展上下文/抓取任务、demo 登录会话都已持久化到本地 H2')
    expect(backendReadme).toContain('系统治理壳层')
    expect(backendReadme).toContain('system_governance_audit_logs')
    expect(backendReadme).toContain('非真实配置中心')
  })
})
