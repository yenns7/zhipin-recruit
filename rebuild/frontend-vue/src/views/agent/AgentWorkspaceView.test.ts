import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import router from '@/router'
import AgentWorkspaceView from '@/views/agent/AgentWorkspaceView.vue'

const fetchMock = vi.fn()

describe('AgentWorkspaceView', () => {
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

  it('registers agent route for authenticated users', () => {
    expect(router.resolve('/agent').name).toBe('AgentWorkspace')
  })

  it('loads conversation list and initial messages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              conversations: [
                {
                  id: 'daily-ops',
                  title: '今日招聘助手',
                  description: '适合演示收件箱和 confirm-first。',
                  lastMessagePreview: '先告诉我你想查什么',
                  lastMessageRole: 'assistant',
                  messageCount: 2,
                  unreadCount: 0,
                  updatedAt: '2026-07-06T10:00:00Z',
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
            timestamp: 1720000001,
            data: {
              conversation: {
                id: 'daily-ops',
                title: '今日招聘助手',
                description: '适合演示收件箱和 confirm-first。',
                lastMessagePreview: '先告诉我你想查什么',
                lastMessageRole: 'assistant',
                messageCount: 2,
                unreadCount: 0,
                updatedAt: '2026-07-06T10:00:00Z',
              },
              messages: [
                {
                  id: 'm1',
                  role: 'assistant',
                  content: '先告诉我你想查什么；如果是写操作，我只会先生成确认卡片。',
                  messageType: 'text',
                  createdAt: '2026-07-06T10:00:00Z',
                },
                {
                  id: 'm2',
                  role: 'user',
                  content: '今天先帮我看看待处理候选人进展',
                  messageType: 'text',
                  createdAt: '2026-07-06T10:01:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(AgentWorkspaceView, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/agent/conversations', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/agent/conversations/daily-ops', expect.any(Object))
    expect(wrapper.text()).toContain('今日招聘助手')
    expect(wrapper.text()).toContain('今天先帮我看看待处理候选人进展')
    expect(wrapper.text()).toContain('写操作，我只会先生成确认卡片')
  })

  it('sends a write intent and renders a pending confirmation card', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1720000000,
            data: {
              conversations: [
                {
                  id: 'daily-ops',
                  title: '今日招聘助手',
                  description: '适合演示收件箱和 confirm-first。',
                  lastMessagePreview: '先告诉我你想查什么',
                  lastMessageRole: 'assistant',
                  messageCount: 2,
                  unreadCount: 0,
                  updatedAt: '2026-07-06T10:00:00Z',
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
            timestamp: 1720000001,
            data: {
              conversation: {
                id: 'daily-ops',
                title: '今日招聘助手',
                description: '适合演示收件箱和 confirm-first。',
                lastMessagePreview: '先告诉我你想查什么',
                lastMessageRole: 'assistant',
                messageCount: 2,
                unreadCount: 0,
                updatedAt: '2026-07-06T10:00:00Z',
              },
              messages: [
                {
                  id: 'm1',
                  role: 'assistant',
                  content: '先告诉我你想查什么；如果是写操作，我只会先生成确认卡片。',
                  messageType: 'text',
                  createdAt: '2026-07-06T10:00:00Z',
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
              conversationId: 'daily-ops',
              userMessage: {
                id: 'm2',
                role: 'user',
                content: '把候选人林然推进到面试并通知面试官',
                messageType: 'text',
                createdAt: '2026-07-06T10:02:00Z',
              },
              assistantMessage: {
                id: 'm3',
                role: 'assistant',
                content: '我把这条请求识别成写操作意图了，下面先给你确认卡片。',
                messageType: 'confirmation',
                createdAt: '2026-07-06T10:02:01Z',
                confirmation: {
                  status: 'pending_confirm',
                  title: '待确认写操作',
                  summary: '当前 demo 只生成确认卡片，不会直接执行。',
                  riskNote: '未写入真实业务数据',
                  confirmLabel: '确认后再执行',
                  cancelLabel: '保持现状',
                  executed: false,
                  fields: [
                    { label: '请求内容', value: '把候选人林然推进到面试并通知面试官' },
                    { label: '当前角色', value: 'recruiter' },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const wrapper = mount(AgentWorkspaceView, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    await flushPromises()

    await wrapper.get('textarea').setValue('把候选人林然推进到面试并通知面试官')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agent/conversations/daily-ops/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: '把候选人林然推进到面试并通知面试官',
        }),
      }),
    )
    expect(wrapper.text()).toContain('待确认写操作')
    expect(wrapper.text()).toContain('确认后再执行')
    expect(wrapper.text()).toContain('未写入真实业务数据')
  })

  it('shows agent entry in admin layout navigation', async () => {
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

    expect(wrapper.text()).toContain('AI 助手')
  })
})
