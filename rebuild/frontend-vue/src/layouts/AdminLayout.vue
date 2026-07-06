<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const navItems = computed(() => {
  const items = [
    { to: '/', label: '工作台', icon: 'dashboard', roles: ['recruiter', 'manager', 'admin', 'interviewer'] },
    { to: '/candidates', label: '候选人', icon: 'people', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/jobs', label: '岗位管理', icon: 'briefcase', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/pipeline', label: '招聘流程', icon: 'kanban', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/talent-map', label: '人才地图', icon: 'map', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/interviews', label: 'AI 面试', icon: 'clipboard', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
  ]
  return items.filter(i => i.roles.includes(auth.role || 'recruiter'))
})

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="flex h-screen bg-surface-soft">
    <!-- Sidebar -->
    <aside class="w-60 bg-white border-r border-hairline flex flex-col shrink-0">
      <div class="h-14 flex items-center px-6 border-b border-hairline">
        <span class="font-display text-lg text-ink">智聘</span>
      </div>
      <nav class="flex-1 py-4 px-3 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="route.path === item.to ? 'bg-surface-soft text-ink font-medium' : 'text-muted hover:text-body hover:bg-surface-soft'"
        >
          <span class="w-4 h-4 inline-block text-current">{{ item.icon.charAt(0).toUpperCase() }}</span>
          {{ item.label }}
        </router-link>
      </nav>
      <div class="p-4 border-t border-hairline">
        <div class="flex items-center gap-2 text-sm text-muted mb-2">
          <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
          {{ auth.name || '用户' }}
        </div>
        <button
          @click="handleLogout"
          class="text-xs text-muted hover:text-danger transition-colors"
        >
          退出登录
        </button>
      </div>
    </aside>
    <!-- Main -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 bg-white border-b border-hairline flex items-center px-6">
        <h1 class="text-sm font-medium text-ink">{{ route.meta?.title || '智聘' }}</h1>
      </header>
      <main class="flex-1 overflow-auto p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
