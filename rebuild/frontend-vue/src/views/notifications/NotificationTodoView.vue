<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, api } from '@/api/http'
import NotificationTodoCard from '@/components/notifications/NotificationTodoCard.vue'
import { useAuthStore } from '@/stores/auth'
import type { NotificationTodoResponse } from '@/types/api'

const auth = useAuthStore()
const payload = ref<NotificationTodoResponse | null>(null)
const loading = ref(true)
const error = ref('')
const actionMessage = ref('')
const pendingTodoId = ref<string | null>(null)

const generatedAtLabel = computed(() => {
  if (!payload.value?.generatedAt) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(payload.value.generatedAt))
})

const roleHint = computed(() => {
  const role = payload.value?.role || auth.role || 'recruiter'
  if (role === 'manager') return '你看到的是跨岗位的升级提醒与分配建议。'
  if (role === 'interviewer') return '你看到的是需要补反馈和准备下一场面试的事项。'
  if (role === 'admin') return '你看到的是 demo 联调视角下的角色链路检查项。'
  return '你看到的是候选人推进、邀约和岗位补充相关事项。'
})

async function loadTodos() {
  try {
    payload.value = await api.getNotificationTodos()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '通知与待办加载失败'
  }
}

async function updateTodo(todoId: string, action: 'complete' | 'archive') {
  pendingTodoId.value = todoId
  actionMessage.value = ''
  error.value = ''
  try {
    const result = action === 'complete'
      ? await api.completeNotificationTodo(todoId)
      : await api.archiveNotificationTodo(todoId)
    await loadTodos()
    actionMessage.value = action === 'complete'
      ? `${result.statusLabel}，已标记为完成`
      : `${result.statusLabel}，提醒已从当前列表移除`
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '待办更新失败'
  } finally {
    pendingTodoId.value = null
  }
}

onMounted(async () => {
  await loadTodos()
  loading.value = false
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl bg-white p-6 shadow-card">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-sm text-muted">提醒中心</p>
          <h2 class="mt-2 font-display text-2xl text-ink">
            {{ payload?.summary.title || '通知与待办' }}
          </h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-body">
            {{ payload?.summary.highlight || '这里会按当前登录角色展示 demo/in-memory 的待处理事项。' }}
          </p>
          <p class="mt-2 text-xs text-muted">{{ roleHint }}</p>
          <p class="mt-2 text-xs text-muted">当前操作仅保存在 demo / in-memory 数据中，刷新服务后会恢复初始演示数据。</p>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-surface-soft px-4 py-3">
            <p class="text-xs text-muted">开放待办</p>
            <p class="mt-1 font-display text-xl text-ink">{{ payload?.summary.openCount ?? '--' }}</p>
          </div>
          <div class="rounded-xl bg-surface-soft px-4 py-3">
            <p class="text-xs text-muted">更新时间</p>
            <p class="mt-1 font-display text-xl text-ink">{{ generatedAtLabel }}</p>
          </div>
        </div>
      </div>
    </section>

    <p v-if="actionMessage" class="text-sm text-emerald-600">{{ actionMessage }}</p>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-else-if="loading" class="rounded-2xl bg-white p-6 text-sm text-muted shadow-card">加载中…</div>

    <div
      v-else-if="payload?.items.length"
      class="grid grid-cols-1 gap-4 xl:grid-cols-2"
    >
      <NotificationTodoCard
        v-for="item in payload.items"
        :key="item.id"
        :item="item"
        :busy="pendingTodoId === item.id"
        @complete="updateTodo(item.id, 'complete')"
        @archive="updateTodo(item.id, 'archive')"
      />
    </div>

    <div v-else class="rounded-2xl bg-white p-8 text-center text-sm text-muted shadow-card">
      当前没有待办，可以先去岗位、候选人或面试列表继续操作。
    </div>
  </div>
</template>
