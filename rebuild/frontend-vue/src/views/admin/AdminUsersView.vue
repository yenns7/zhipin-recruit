<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, getToken } from '@/api/http'
import type {
  AdminUserApiItem,
  AdminUserCreatePayload,
  AdminUserListItem,
  AdminUserResetPasswordPayload,
  AdminUserResetPasswordResponse,
  AdminUserRole,
  AdminUserUpdatePayload,
} from '@/types/api'

const users = ref<AdminUserListItem[]>([])
const loading = ref(true)
const error = ref('')
const actionMessage = ref('')
const actionError = ref('')
const activeAction = ref('')
const editingUserId = ref<number | null>(null)
const resettingUserId = ref<number | null>(null)

const createForm = ref<AdminUserCreatePayload>({
  name: '',
  email: '',
  role: 'recruiter',
  password: '',
  active: true,
})

const editForm = ref<AdminUserUpdatePayload>({
  name: '',
  role: 'recruiter',
  active: true,
})

const resetPasswordForm = ref<AdminUserResetPasswordPayload>({
  newPassword: '',
})

const roleOptions: { value: AdminUserRole; label: string }[] = [
  { value: 'admin', label: '管理员' },
  { value: 'manager', label: '经理' },
  { value: 'recruiter', label: '招聘专员' },
  { value: 'interviewer', label: '面试官' },
]

const summary = computed(() => ({
  total: users.value.length,
  active: users.value.filter(user => user.isActive).length,
  inactive: users.value.filter(user => !user.isActive).length,
  admins: users.value.filter(user => user.role === 'admin').length,
}))

function normalizeUser(user: AdminUserApiItem): AdminUserListItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive ?? user.active ?? false,
    createdAt: user.createdAt,
  }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const text = await response.text()
    let message = `请求失败 (${response.status})`
    try {
      const payload = JSON.parse(text)
      message = payload.error || payload.message || message
    } catch {}
    throw new ApiError(response.status, message)
  }
  const text = await response.text()
  if (!text) {
    return null as T
  }
  const payload = JSON.parse(text) as T | { data?: T }
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data
  }
  return payload as T
}

function statusLabel(user: AdminUserListItem): string {
  return user.isActive ? '启用中' : '已停用'
}

function roleLabel(role: AdminUserRole): string {
  return roleOptions.find(option => option.value === role)?.label ?? role
}

function isActionRunning(actionKey: string): boolean {
  return activeAction.value === actionKey
}

function formatCreatedAt(value: string | null): string {
  if (!value) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function loadUsers() {
  try {
    const payload = await adminRequest<AdminUserApiItem[]>('/admin/users')
    users.value = payload.map(normalizeUser)
    error.value = ''
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error.value = '仅管理员可查看用户治理 demo 页面。'
    } else {
      error.value = err instanceof Error ? err.message : '用户治理页面加载失败'
    }
  }
}

async function runMutation(
  actionKey: string,
  request: () => Promise<unknown>,
  successMessage: string,
  shouldRefresh = true,
) {
  actionMessage.value = ''
  actionError.value = ''
  activeAction.value = actionKey

  try {
    await request()
    actionMessage.value = successMessage
    if (shouldRefresh) {
      await loadUsers()
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '用户治理写操作失败'
  } finally {
    activeAction.value = ''
  }
}

function openEditForm(user: AdminUserListItem) {
  editingUserId.value = user.id
  editForm.value = {
    name: user.name,
    role: user.role,
    active: user.isActive,
  }
}

function closeEditForm() {
  editingUserId.value = null
}

function openResetPasswordForm(userId: number) {
  resettingUserId.value = userId
  resetPasswordForm.value = { newPassword: '' }
}

function closeResetPasswordForm() {
  resettingUserId.value = null
}

async function submitCreateForm() {
  const payload = { ...createForm.value }
  await runMutation(
    'create',
    () => adminRequest<AdminUserApiItem>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    `已创建账号：${payload.name}`,
  )
  createForm.value = {
    name: '',
    email: '',
    role: 'recruiter',
    password: '',
    active: true,
  }
}

async function submitEditForm(userId: number) {
  const payload = { ...editForm.value }
  await runMutation(
    `edit:${userId}`,
    () => adminRequest<AdminUserApiItem>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    `已更新账号：${payload.name}`,
  )
  closeEditForm()
}

async function submitResetPassword(user: AdminUserListItem) {
  const payload = { ...resetPasswordForm.value }
  await runMutation(
    `reset:${user.id}`,
    () => adminRequest<AdminUserResetPasswordResponse>(`/admin/users/${user.id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    `已重置密码：${user.name}`,
    false,
  )
  closeResetPasswordForm()
}

onMounted(async () => {
  try {
    await loadUsers()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl bg-white p-6 shadow-card">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-muted">Admin Only</p>
          <h2 class="mt-2 font-display text-2xl text-ink">用户治理</h2>
          <p class="mt-3 max-w-3xl text-sm text-muted">
            这里只补最小可写 MVP：管理员可在 demo 范围内创建试点账号、编辑角色与启停状态、
            重置密码，方便试跑不同视角，不扩展成完整用户中心。
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-surface-soft px-4 py-3 text-muted">
            <div>总用户</div>
            <div class="mt-1 font-display text-lg text-ink">{{ summary.total }}</div>
          </div>
          <div class="rounded-xl bg-surface-soft px-4 py-3 text-muted">
            <div>停用中</div>
            <div class="mt-1 font-display text-lg text-ink">{{ summary.inactive }}</div>
          </div>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <p v-if="actionMessage" class="text-sm text-emerald-700">{{ actionMessage }}</p>
    <p v-if="actionError" class="text-sm text-danger">{{ actionError }}</p>
    <div v-if="loading" class="rounded-xl bg-white p-6 text-sm text-muted shadow-card">加载中…</div>

    <template v-else>
      <section class="grid gap-4 md:grid-cols-4">
        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs text-muted">启用账号</p>
          <p class="mt-2 font-display text-2xl text-ink">{{ summary.active }}</p>
        </div>
        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs text-muted">停用账号</p>
          <p class="mt-2 font-display text-2xl text-ink">{{ summary.inactive }}</p>
        </div>
        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs text-muted">管理员</p>
          <p class="mt-2 font-display text-2xl text-ink">{{ summary.admins }}</p>
        </div>
        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs text-muted">当前范围</p>
          <p class="mt-2 text-sm text-body">demo-only 账号治理壳层</p>
        </div>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow-card">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-2xl">
            <h3 class="font-display text-lg text-ink">创建试点账号</h3>
            <p class="mt-1 text-sm text-muted">
              按最小契约创建 demo-only 账号；仅用于本地重构环境联调，不替代正式账号中心。
            </p>
          </div>
          <form class="grid gap-3 md:grid-cols-2 lg:w-[42rem]" data-testid="create-form" @submit.prevent="submitCreateForm">
            <label class="text-sm text-body">
              姓名
              <input
                data-testid="create-name"
                v-model.trim="createForm.name"
                type="text"
                required
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
            </label>
            <label class="text-sm text-body">
              邮箱
              <input
                data-testid="create-email"
                v-model.trim="createForm.email"
                type="email"
                required
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
            </label>
            <label class="text-sm text-body">
              角色
              <select
                data-testid="create-role"
                v-model="createForm.role"
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              >
                <option v-for="option in roleOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="text-sm text-body">
              初始密码
              <input
                data-testid="create-password"
                v-model="createForm.password"
                type="password"
                required
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
            </label>
            <label class="inline-flex items-center gap-2 text-sm text-body">
              <input
                data-testid="create-active"
                v-model="createForm.active"
                type="checkbox"
                class="rounded border-hairline"
              />
              创建后立即启用
            </label>
            <div class="flex items-center justify-end">
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isActionRunning('create')"
              >
                {{ isActionRunning('create') ? '提交中…' : '创建账号' }}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section class="space-y-4">
        <div
          v-for="user in users"
          :key="user.id"
          class="rounded-2xl bg-white p-5 shadow-card"
        >
          <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-display text-lg text-ink">{{ user.name }}</h3>
                <span
                  class="rounded-full px-2.5 py-1 text-xs"
                  :class="user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'"
                >
                  {{ statusLabel(user) }}
                </span>
                <span class="rounded-full bg-surface-soft px-2.5 py-1 text-xs text-body">
                  {{ roleLabel(user.role) }}
                </span>
              </div>
              <p class="mt-2 text-sm text-body">{{ user.email }}</p>
              <p class="mt-1 text-xs text-muted">创建时间：{{ formatCreatedAt(user.createdAt) }}</p>
            </div>

            <div class="flex flex-wrap gap-3 xl:justify-end">
              <button
                :data-testid="`edit-user-${user.id}`"
                type="button"
                class="inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-body transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                @click="openEditForm(user)"
              >
                编辑账号
              </button>
              <button
                :data-testid="`reset-password-${user.id}`"
                type="button"
                class="inline-flex items-center justify-center rounded-lg border border-hairline bg-surface-soft px-4 py-2 text-sm font-medium text-body transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                @click="openResetPasswordForm(user.id)"
              >
                重置密码
              </button>
            </div>
          </div>

          <form
            v-if="editingUserId === user.id"
            :data-testid="`edit-form-${user.id}`"
            class="mt-4 grid gap-3 rounded-xl bg-surface-soft p-4 md:grid-cols-2"
            @submit.prevent="submitEditForm(user.id)"
          >
            <label class="text-sm text-body">
              姓名
              <input
                :data-testid="`edit-name-${user.id}`"
                v-model.trim="editForm.name"
                type="text"
                required
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
            </label>
            <label class="text-sm text-body">
              角色
              <select
                :data-testid="`edit-role-${user.id}`"
                v-model="editForm.role"
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              >
                <option v-for="option in roleOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="inline-flex items-center gap-2 text-sm text-body">
              <input
                :data-testid="`edit-active-${user.id}`"
                v-model="editForm.active"
                type="checkbox"
                class="rounded border-hairline"
              />
              账号启用中
            </label>
            <div class="flex items-center justify-end gap-3">
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-body transition hover:border-ink/30 hover:text-ink"
                @click="closeEditForm"
              >
                取消
              </button>
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isActionRunning(`edit:${user.id}`)"
              >
                {{ isActionRunning(`edit:${user.id}`) ? '保存中…' : '保存修改' }}
              </button>
            </div>
          </form>

          <form
            v-if="resettingUserId === user.id"
            :data-testid="`reset-password-form-${user.id}`"
            class="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-hairline p-4 md:flex-row md:items-end"
            @submit.prevent="submitResetPassword(user)"
          >
            <label class="flex-1 text-sm text-body">
              新密码
              <input
                :data-testid="`reset-password-input-${user.id}`"
                v-model="resetPasswordForm.newPassword"
                type="password"
                required
                class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
            </label>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-body transition hover:border-ink/30 hover:text-ink"
                @click="closeResetPasswordForm"
              >
                取消
              </button>
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-lg bg-surface-soft px-4 py-2 text-sm font-medium text-body transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isActionRunning(`reset:${user.id}`)"
              >
                {{ isActionRunning(`reset:${user.id}`) ? '提交中…' : '确认重置' }}
              </button>
            </div>
          </form>
        </div>

        <div
          v-if="!users.length"
          class="rounded-2xl border border-dashed border-hairline bg-white p-8 text-center text-sm text-muted shadow-card"
        >
          当前 demo 环境还没有可治理的用户账号。
        </div>
      </section>
    </template>
  </div>
</template>
