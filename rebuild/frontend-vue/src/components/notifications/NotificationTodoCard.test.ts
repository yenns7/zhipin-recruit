import { describe, expect, it } from 'vitest'
import { RouterLinkStub, mount } from '@vue/test-utils'
import NotificationTodoCard from '@/components/notifications/NotificationTodoCard.vue'
import type { NotificationTodoItem } from '@/types/api'

const item: NotificationTodoItem = {
  id: 'todo-1',
  title: '补齐候选人初筛结论',
  message: '今天有 3 位候选人还没有完成初筛，建议先处理 Java 后端岗位。',
  priority: 'high',
  priorityLabel: '高优先级',
  status: 'open',
  statusLabel: '待处理',
  nextActionLabel: '查看候选人',
  nextActionPath: '/candidates',
  dueHint: '今天 18:00 前',
  audience: 'recruiter',
}

describe('NotificationTodoCard', () => {
  it('renders reminder content and action entry', () => {
    const wrapper = mount(NotificationTodoCard, {
      props: {
        item,
        busy: false,
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    expect(wrapper.text()).toContain('补齐候选人初筛结论')
    expect(wrapper.text()).toContain('高优先级')
    expect(wrapper.text()).toContain('查看候选人')
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/candidates')
    expect(wrapper.get('[data-testid="complete-todo"]').text()).toContain('完成')
    expect(wrapper.get('[data-testid="archive-todo"]').text()).toContain('归档')
  })

  it('emits complete and archive events for active items', async () => {
    const wrapper = mount(NotificationTodoCard, {
      props: {
        item,
        busy: false,
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await wrapper.get('[data-testid="complete-todo"]').trigger('click')
    await wrapper.get('[data-testid="archive-todo"]').trigger('click')

    expect(wrapper.emitted('complete')).toHaveLength(1)
    expect(wrapper.emitted('archive')).toHaveLength(1)
  })

  it('hides write actions for completed items', () => {
    const wrapper = mount(NotificationTodoCard, {
      props: {
        item: {
          ...item,
          status: 'completed',
          statusLabel: '已完成',
        },
        busy: false,
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    expect(wrapper.find('[data-testid="complete-todo"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="archive-todo"]').exists()).toBe(false)
  })
})
