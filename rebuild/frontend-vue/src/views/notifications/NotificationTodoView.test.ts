import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import router from '@/router'
import NotificationTodoView from '@/views/notifications/NotificationTodoView.vue'

const fetchMock = vi.fn()

describe('NotificationTodoView', () => {
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

  it('registers notifications route for authenticated users', () => {
    expect(router.resolve('/notifications').name).toBe('Notifications')
  })

  it('loads reminder cards and shows recruiter actions', async () => {
    fetchMock.mockResolvedValueOnce(todoListResponse({
      summary: {
        title: '招聘专员待办',
        highlight: '今天优先清掉初筛与约面试积压',
        openCount: 3,
      },
      items: [
        {
          id: 'recruiter-1',
          title: '补齐候选人初筛结论',
          message: '今天有 3 位候选人还没有完成初筛。',
          priority: 'high',
          priorityLabel: '高优先级',
          status: 'open',
          statusLabel: '待处理',
          nextActionLabel: '查看候选人',
          nextActionPath: '/candidates',
          dueHint: '今天 18:00 前',
          audience: 'recruiter',
        },
      ],
    }))

    const wrapper = mount(NotificationTodoView, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notifications/todos', expect.any(Object))
    expect(wrapper.text()).toContain('招聘专员待办')
    expect(wrapper.text()).toContain('今天优先清掉初筛与约面试积压')
    expect(wrapper.text()).toContain('查看候选人')
    expect(wrapper.text()).toContain('当前操作仅保存在 demo / in-memory 数据中')
  })

  it('submits completion action and refreshes todo list with feedback', async () => {
    fetchMock
      .mockResolvedValueOnce(todoListResponse({
        summary: {
          title: '招聘专员待办',
          highlight: '今天优先清掉初筛与约面试积压',
          openCount: 3,
        },
        items: [
          {
            id: 'recruiter-1',
            title: '补齐候选人初筛结论',
            message: '今天有 3 位候选人还没有完成初筛。',
            priority: 'high',
            priorityLabel: '高优先级',
            status: 'open',
            statusLabel: '待处理',
            nextActionLabel: '查看候选人',
            nextActionPath: '/candidates',
            dueHint: '今天 18:00 前',
            audience: 'recruiter',
          },
        ],
      }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1710000001,
            data: {
              id: 'recruiter-1',
              status: 'completed',
              statusLabel: '已完成',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(todoListResponse({
        summary: {
          title: '招聘专员待办',
          highlight: '今天优先清掉初筛与约面试积压',
          openCount: 0,
        },
        items: [
          {
            id: 'recruiter-1',
            title: '补齐候选人初筛结论',
            message: '今天有 3 位候选人还没有完成初筛。',
            priority: 'high',
            priorityLabel: '高优先级',
            status: 'completed',
            statusLabel: '已完成',
            nextActionLabel: '查看候选人',
            nextActionPath: '/candidates',
            dueHint: '今天 18:00 前',
            audience: 'recruiter',
          },
        ],
      }))

    const wrapper = mount(NotificationTodoView, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    await flushPromises()
    await wrapper.get('[data-testid="complete-todo"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/notifications/todos/recruiter-1/complete', expect.objectContaining({
      method: 'POST',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/notifications/todos', expect.any(Object))
    expect(wrapper.text()).toContain('已标记为完成')
    expect(wrapper.text()).toContain('已完成')
  })

  it('archives todo and removes it from the list after refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(todoListResponse({
        summary: {
          title: '招聘专员待办',
          highlight: '今天优先清掉初筛与约面试积压',
          openCount: 1,
        },
        items: [
          {
            id: 'recruiter-1',
            title: '补齐候选人初筛结论',
            message: '今天有 3 位候选人还没有完成初筛。',
            priority: 'high',
            priorityLabel: '高优先级',
            status: 'open',
            statusLabel: '待处理',
            nextActionLabel: '查看候选人',
            nextActionPath: '/candidates',
            dueHint: '今天 18:00 前',
            audience: 'recruiter',
          },
        ],
      }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            timestamp: 1710000001,
            data: {
              id: 'recruiter-1',
              status: 'archived',
              statusLabel: '已归档',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(todoListResponse({
        summary: {
          title: '招聘专员待办',
          highlight: '今天优先清掉初筛与约面试积压',
          openCount: 0,
        },
        items: [],
      }))

    const wrapper = mount(NotificationTodoView, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    await flushPromises()
    await wrapper.get('[data-testid="archive-todo"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/notifications/todos/recruiter-1/archive', expect.objectContaining({
      method: 'POST',
    }))
    expect(wrapper.text()).toContain('已归档')
    expect(wrapper.text()).toContain('当前没有待办')
  })
})

function todoListResponse(data: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      code: 200,
      message: 'ok',
      timestamp: 1710000000,
      data: {
        role: 'recruiter',
        generatedAt: '2026-07-06T10:00:00Z',
        ...data,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
