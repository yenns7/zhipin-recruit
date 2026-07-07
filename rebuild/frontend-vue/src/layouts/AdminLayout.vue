<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { computed, ref } from 'vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const showPasswordPanel = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const passwordMessage = ref('')
const passwordError = ref('')
const changingPassword = ref(false)

const navItems = computed(() => {
  const items = [
    { to: '/', label: '工作台', icon: 'dashboard', roles: ['recruiter', 'manager', 'admin', 'interviewer'] },
    { to: '/candidates', label: '简历库', icon: 'people', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/upload', label: '上传简历', icon: 'upload', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/jobs', label: '招聘管理', icon: 'briefcase', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/pipeline', label: '候选人流程', icon: 'kanban', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/talent-map', label: '人才地图', icon: 'map', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/interviews', label: auth.role === 'interviewer' ? '我的面试' : '面试任务', icon: 'clipboard', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
    { to: '/agent', label: 'AI 助手', icon: 'agent', roles: ['recruiter', 'manager', 'admin'] },
    { to: '/notifications', label: '通知待办', icon: 'bell', roles: ['recruiter', 'interviewer', 'manager', 'admin'] },
    { to: '/admin/users', label: '用户治理', icon: 'users', roles: ['admin'] },
    { to: '/admin/system', label: '系统设置', icon: 'shield', roles: ['admin'] },
  ]
  return items.filter(i => i.roles.includes(auth.role || 'recruiter'))
})

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

async function submitPasswordChange() {
  changingPassword.value = true
  passwordMessage.value = ''
  passwordError.value = ''
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    passwordMessage.value = '密码已更新，可继续使用当前 demo 会话'
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : '密码更新失败'
  } finally {
    changingPassword.value = false
  }
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
          data-test="toggle-password-panel"
          type="button"
          @click="showPasswordPanel = !showPasswordPanel"
          class="mr-3 text-xs text-muted hover:text-ink transition-colors"
        >
          修改密码
        </button>
        <button
          data-test="logout"
          type="button"
          @click="handleLogout"
          class="text-xs text-muted hover:text-danger transition-colors"
        >
          退出登录
        </button>
        <form
          v-if="showPasswordPanel"
          data-test="submit-password"
          class="mt-3 space-y-2"
          @submit.prevent="submitPasswordChange"
        >
          <input
            v-model="currentPassword"
            data-test="current-password"
            type="password"
            placeholder="当前密码"
            class="w-full rounded-lg border border-hairline px-3 py-2 text-xs"
          >
          <input
            v-model="newPassword"
            data-test="new-password"
            type="password"
            placeholder="新密码"
            class="w-full rounded-lg border border-hairline px-3 py-2 text-xs"
          >
          <button
            type="submit"
            class="w-full rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            :disabled="changingPassword"
          >
            {{ changingPassword ? '提交中…' : '保存密码' }}
          </button>
          <p v-if="passwordMessage" class="text-xs text-emerald-600">{{ passwordMessage }}</p>
          <p v-if="passwordError" class="text-xs text-danger">{{ passwordError }}</p>
        </form>
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
