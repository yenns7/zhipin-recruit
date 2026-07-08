import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import InterviewListView from './InterviewListView.vue'
import { defineComponent } from 'vue'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('InterviewListView - navigation', () => {
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
    localStorage.setItem('hireinsight_role', 'interviewer')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicking a row navigates to the interview report', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'Interviews', component: InterviewListView },
        {
          path: '/interviews/:interviewId',
          name: 'InterviewReport',
          component: defineComponent({ template: '<div>report</div>' }),
        },
      ],
    })

    ;(fetch as any).mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          code: 200,
          message: 'ok',
          data: [
            {
              id: 7,
              candidate_name: '林然',
              job_title: '前端',
              status: 'draft',
              score: null,
              created_at: '2026-07-08',
            },
          ],
        }),
      ),
    )

    await router.push('/')
    await router.isReady()

    const wrapper = mount(InterviewListView, {
      global: { plugins: [createPinia(), router] },
    })

    await flushPromises()
    await flushPromises()

    // The list should render the row
    expect(wrapper.text()).toContain('林然')

    // Click the detail link
    const link = wrapper.get('[data-testid="interview-detail-link"]')
    await link.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('InterviewReport')
    expect(router.currentRoute.value.params.interviewId).toBe('7')
  })
})
