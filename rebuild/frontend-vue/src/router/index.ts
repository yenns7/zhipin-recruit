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
          meta: { title: '简历库', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'upload',
          name: 'ResumeUpload',
          component: () => import('@/views/upload/ResumeUploadView.vue'),
          meta: { title: '上传简历', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'candidates/:candidateId',
          name: 'CandidateDetail',
          component: () => import('@/views/candidates/CandidateDetailView.vue'),
          meta: { title: '候选人详情', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'jobs',
          name: 'Jobs',
          component: () => import('@/views/jobs/JobListView.vue'),
          meta: { title: '招聘管理', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'pipeline',
          name: 'Pipeline',
          component: () => import('@/views/pipeline/PipelineBoardView.vue'),
          meta: { title: '候选人流程', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'talent-map',
          name: 'TalentMap',
          component: () => import('@/views/talent-map/TalentMapView.vue'),
          meta: { title: '人才地图', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'match',
          name: 'MatchRecommendations',
          component: () => import('@/views/match/MatchRecommendationsView.vue'),
          meta: { title: '智能推荐', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'interviews',
          name: 'Interviews',
          component: () => import('@/views/interviews/InterviewListView.vue'),
          meta: { title: '面试任务', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
        },
        {
          path: 'interviews/:interviewId',
          name: 'InterviewReport',
          component: () => import('@/views/interviews/InterviewReportView.vue'),
          meta: { title: '面试报告', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
        },
        {
          path: 'notifications',
          name: 'Notifications',
          component: () => import('@/views/notifications/NotificationTodoView.vue'),
          meta: { title: '通知待办', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
        },
        {
          path: 'agent',
          name: 'AgentWorkspace',
          component: () => import('@/views/agent/AgentWorkspaceView.vue'),
          meta: { title: 'AI 助手', roles: ['recruiter', 'manager', 'admin'] },
        },
        {
          path: 'bi',
          name: 'BiInsights',
          component: () => import('@/views/bi/BiInsightsView.vue'),
          meta: { title: '数据看板', roles: ['manager', 'admin'] },
        },
        {
          path: 'admin/users',
          name: 'AdminUsers',
          component: () => import('@/views/admin/AdminUsersView.vue'),
          meta: { title: '用户治理', roles: ['admin'] },
        },
        {
          path: 'admin/system',
          name: 'AdminSystem',
          component: () => import('@/views/admin/SystemAdminView.vue'),
          meta: { title: '系统设置', roles: ['admin'] },
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
  const role = localStorage.getItem('hireinsight_role') as Role | null
  const meta = to.meta
  if (meta.requiresAuth !== false && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (meta.roles?.length && (!role || !meta.roles.includes(role))) {
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

export default router
