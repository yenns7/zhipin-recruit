import { createRouter, createWebHistory } from 'vue-router'
import type { Role } from '@/types'

// Augment Vue Router's RouteMeta
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    roles?: Role[]
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/login/LoginView.vue'),
      meta: { title: '登录', requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'Dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
          meta: { title: '工作台' },
        },
        {
          path: 'candidates',
          name: 'Candidates',
          component: () => import('@/views/candidates/CandidateListView.vue'),
          meta: { title: '候选人', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'jobs',
          name: 'Jobs',
          component: () => import('@/views/jobs/JobListView.vue'),
          meta: { title: '岗位管理', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'pipeline',
          name: 'Pipeline',
          component: () => import('@/views/pipeline/PipelineBoardView.vue'),
          meta: { title: '招聘流程', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'interviews',
          name: 'Interviews',
          component: () => import('@/views/interviews/InterviewListView.vue'),
          meta: { title: 'AI 面试', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('hireinsight_token')
  const meta = to.meta
  if (meta.requiresAuth !== false && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
