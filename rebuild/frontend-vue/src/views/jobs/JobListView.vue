<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { api } from '@/api/http'
import type { JobCreateInput, JobListItem, PaginatedResponse } from '@/types/api'
import type { Role } from '@/types'

const currentRole = ref<Role>((localStorage.getItem('hireinsight_role') as Role | null) || 'recruiter')
const canCreateJob = computed(() => ['recruiter', 'manager', 'admin'].includes(currentRole.value))

const items = ref<JobListItem[]>([])
const pageInfo = ref<PaginatedResponse<JobListItem>>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
})
const page = ref(1)
const pageSize = ref(10)
const status = ref('')
const loading = ref(true)
const error = ref('')

// Create-job form state
const showCreateForm = ref(false)
const creating = ref(false)
const createError = ref('')
const createSuccess = ref('')
const form = ref<JobCreateInput>({ title: '', jdText: '' })

const canGoNext = computed(() => page.value * pageSize.value < pageInfo.value.total)
const canGoPrev = computed(() => page.value > 1)

async function loadJobs() {
  loading.value = true
  error.value = ''
  try {
    const result = await api.listJobs({
      page: page.value,
      pageSize: pageSize.value,
      status: status.value || undefined,
    })
    pageInfo.value = result
    items.value = result.items
  } catch (err) {
    error.value = err instanceof Error ? err.message : '岗位加载失败'
  } finally {
    loading.value = false
  }
}

function toggleCreateForm() {
  showCreateForm.value = !showCreateForm.value
  if (!showCreateForm.value) {
    createError.value = ''
  }
}

function resetCreateForm() {
  form.value = { title: '', jdText: '' }
}

async function submitCreate() {
  createError.value = ''
  createSuccess.value = ''
  if (!form.value.title.trim() || !form.value.jdText.trim()) {
    createError.value = '岗位名称和岗位描述不能为空'
    return
  }
  creating.value = true
  try {
    const result = await api.createJob({ title: form.value.title.trim(), jdText: form.value.jdText.trim() })
    createSuccess.value = `已创建岗位 #${result.id}`
    resetCreateForm()
    showCreateForm.value = false
    await loadJobs()
  } catch (err) {
    createError.value = err instanceof Error ? err.message : '岗位创建失败'
  } finally {
    creating.value = false
  }
}

function goNext() {
  if (!canGoNext.value) return
  page.value += 1
  void loadJobs()
}

function goPrev() {
  if (!canGoPrev.value) return
  page.value -= 1
  void loadJobs()
}

function applyStatusFilter() {
  page.value = 1
  void loadJobs()
}

function resetFilters() {
  status.value = ''
  page.value = 1
  void loadJobs()
}

onMounted(async () => {
  await loadJobs()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-lg text-ink">招聘管理</h2>
      <div class="flex items-center gap-2 text-sm">
        <select
          v-model="status"
          data-testid="job-status-filter"
          class="rounded-lg border border-hairline bg-white px-2 py-1 text-body"
          @change="applyStatusFilter"
        >
          <option value="">全部状态</option>
          <option value="active">招聘中</option>
          <option value="closed">已关闭</option>
        </select>
        <button
          type="button"
          data-testid="list-reset"
          class="rounded-lg border border-hairline px-3 py-1 text-muted hover:text-ink"
          @click="resetFilters"
        >
          重置
        </button>
        <button
          v-if="canCreateJob"
          type="button"
          data-testid="toggle-create-job"
          class="rounded-lg bg-ink px-3 py-1 text-white hover:opacity-90"
          @click="toggleCreateForm"
        >
          {{ showCreateForm ? '收起' : '新建岗位' }}
        </button>
      </div>
    </div>

    <form
      v-if="showCreateForm && canCreateJob"
      data-testid="create-job-form"
      class="bg-white rounded-xl shadow-card p-4 space-y-3"
      @submit.prevent="submitCreate"
    >
      <div class="space-y-1">
        <label class="text-xs text-muted">岗位名称</label>
        <input
          v-model="form.title"
          type="text"
          required
          data-testid="job-title"
          class="w-full rounded-lg border border-hairline px-3 py-2 text-body"
          placeholder="请输入岗位名称"
        />
      </div>
      <div class="space-y-1">
        <label class="text-xs text-muted">岗位描述（JD）</label>
        <textarea
          v-model="form.jdText"
          required
          data-testid="job-jd"
          rows="4"
          class="w-full rounded-lg border border-hairline px-3 py-2 text-body"
          placeholder="请输入岗位描述"
        ></textarea>
      </div>
      <p v-if="createError" class="text-sm text-danger">{{ createError }}</p>
      <div class="flex items-center gap-3">
        <button
          type="submit"
          data-testid="submit-create-job"
          :disabled="creating"
          class="rounded-lg bg-ink px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {{ creating ? '创建中…' : '创建岗位' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-hairline px-4 py-2 text-muted hover:text-ink"
          @click="toggleCreateForm"
        >
          取消
        </button>
      </div>
    </form>

    <p v-if="createSuccess" class="text-sm text-success">{{ createSuccess }}</p>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else-if="items.length === 0" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
      暂无岗位数据。如果你看不到可选岗位，请联系管理员创建或分配岗位后再继续。
    </div>
    <div v-else class="bg-white rounded-xl shadow-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
            <th class="px-4 py-3 font-medium">岗位名称</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-b border-hairline/50 hover:bg-surface-soft">
            <td class="px-4 py-3 text-body">{{ item.title }}</td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full" :class="item.status === 'active' ? 'bg-success/10 text-success' : 'bg-surface-strong text-muted'">
                {{ item.status === 'active' ? '招聘中' : '已关闭' }}
              </span>
            </td>
            <td class="px-4 py-3 text-muted">{{ item.created_at?.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex items-center justify-between text-xs text-muted">
      <span>共 {{ pageInfo.total }} 条，第 {{ pageInfo.page }} 页</span>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-hairline px-3 py-1 disabled:opacity-50"
          :disabled="!canGoPrev"
          @click="goPrev"
        >
          上一页
        </button>
        <button
          type="button"
          data-testid="pagination-next"
          class="rounded-lg border border-hairline px-3 py-1 disabled:opacity-50"
          :disabled="!canGoNext"
          @click="goNext"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
