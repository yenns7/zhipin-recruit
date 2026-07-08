<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/http'
import type { Role } from '@/types'
import type { InterviewListItem, PaginatedResponse } from '@/types/api'

const router = useRouter()
const currentRole = ref<Role>((localStorage.getItem('hireinsight_role') as Role | null) || 'recruiter')
const items = ref<InterviewListItem[]>([])
const pageInfo = ref<PaginatedResponse<InterviewListItem>>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
})
const page = ref(1)
const pageSize = ref(10)
const loading = ref(true)
const error = ref('')
const scheduleCandidateId = ref<number | null>(null)
const scheduleJobId = ref<number | null>(null)
const scheduleInterviewerId = ref<number | null>(null)
const scheduling = ref(false)
const scheduleMessage = ref('')
const scheduleError = ref('')

const canGoNext = computed(() => page.value * pageSize.value < pageInfo.value.total)
const canGoPrev = computed(() => page.value > 1)
const canSchedule = computed(() => ['recruiter', 'manager', 'admin'].includes(currentRole.value))
const emptyMessage = computed(() =>
  currentRole.value === 'interviewer'
    ? '暂无我的面试；如果看不到面试，请联系招聘专员确认是否已安排给你的面试官账号。'
    : '暂无面试记录。可以先安排面试；如果选不到候选人、岗位或面试官，请先确认候选人已入库、岗位未关闭、面试官账号已由管理员创建并启用。',
)

async function loadInterviews() {
  loading.value = true
  error.value = ''
  try {
    const result = await api.listInterviews({ page: page.value, pageSize: pageSize.value })
    pageInfo.value = result
    items.value = result.items
  } catch (err) {
    error.value = err instanceof Error ? err.message : '面试列表加载失败'
  } finally {
    loading.value = false
  }
}

function goNext() {
  if (!canGoNext.value) return
  page.value += 1
  void loadInterviews()
}

function goPrev() {
  if (!canGoPrev.value) return
  page.value -= 1
  void loadInterviews()
}

function goToDetail(id: number) {
  router.push({ name: 'InterviewReport', params: { interviewId: String(id) } })
}

async function submitSchedule() {
  if (!scheduleCandidateId.value || !scheduleJobId.value || !scheduleInterviewerId.value) {
    scheduleError.value = '请填写候选人 ID、岗位 ID 和面试官账号 ID；如果选不到面试官，请先由管理员创建并启用账号。'
    return
  }
  scheduling.value = true
  scheduleMessage.value = ''
  scheduleError.value = ''
  try {
    const result = await api.scheduleInterview({
      candidateId: scheduleCandidateId.value,
      jobId: scheduleJobId.value,
      interviewerId: scheduleInterviewerId.value,
    })
    scheduleMessage.value = `已安排面试 #${result.id}`
    await loadInterviews()
  } catch (err) {
    scheduleError.value = err instanceof Error ? err.message : '安排面试失败，请确认候选人、岗位、面试官账号和权限仍然有效。'
  } finally {
    scheduling.value = false
  }
}

onMounted(async () => {
  await loadInterviews()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-lg text-ink">面试任务</h2>
    </div>
    <form
      v-if="canSchedule"
      data-testid="schedule-interview"
      class="bg-white rounded-xl shadow-card p-5 space-y-4"
      @submit.prevent="submitSchedule"
    >
      <div>
        <h3 class="font-display text-base text-ink">安排面试</h3>
        <p class="mt-1 text-sm text-muted">
          如果选不到候选人、岗位或面试官，请先确认候选人已入库、岗位未关闭、面试官账号已由管理员创建并启用。
        </p>
      </div>
      <div class="grid gap-3 md:grid-cols-4">
        <label class="text-sm text-muted">
          候选人 ID
          <input
            v-model.number="scheduleCandidateId"
            data-testid="schedule-candidate-id"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-body"
          >
        </label>
        <label class="text-sm text-muted">
          岗位 ID
          <input
            v-model.number="scheduleJobId"
            data-testid="schedule-job-id"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-body"
          >
        </label>
        <label class="text-sm text-muted">
          面试官账号 ID
          <input
            v-model.number="scheduleInterviewerId"
            data-testid="schedule-interviewer-id"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-body"
          >
        </label>
        <div class="flex items-end">
          <button
            type="submit"
            class="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            :disabled="scheduling"
          >
            {{ scheduling ? '安排中…' : '确认安排' }}
          </button>
        </div>
      </div>
      <p v-if="scheduleError" class="text-sm text-danger">{{ scheduleError }}</p>
      <p v-if="scheduleMessage" class="text-sm text-emerald-700">{{ scheduleMessage }}</p>
    </form>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else-if="items.length === 0" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
      {{ emptyMessage }}
    </div>
    <div v-else class="bg-white rounded-xl shadow-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
            <th class="px-4 py-3 font-medium">候选人</th>
            <th class="px-4 py-3 font-medium">岗位</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">评分</th>
            <th class="px-4 py-3 font-medium">创建时间</th>
            <th class="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            class="border-b border-hairline/50 hover:bg-surface-soft cursor-pointer"
            @click="goToDetail(item.id)"
          >
            <td class="px-4 py-3 text-body">{{ item.candidate_name }}</td>
            <td class="px-4 py-3 text-muted">{{ item.job_title }}</td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full bg-surface-soft">{{ item.status }}</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="item.score !== null" class="text-sm font-medium text-ink">{{ item.score }}</span>
              <span v-else class="text-xs text-muted">--</span>
            </td>
            <td class="px-4 py-3 text-muted">{{ item.created_at?.slice(0, 10) }}</td>
            <td class="px-4 py-3">
              <a
                data-testid="interview-detail-link"
                href="#"
                class="text-sm font-medium text-ink underline-offset-2 hover:underline"
                @click.prevent="goToDetail(item.id)"
              >查看报告</a>
            </td>
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
