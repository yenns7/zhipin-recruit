<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { api } from '@/api/http'
import type { CandidateListItem, JobListItem, PaginatedResponse } from '@/types/api'

const items = ref<CandidateListItem[]>([])
const pageInfo = ref<PaginatedResponse<CandidateListItem>>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
})
const page = ref(1)
const pageSize = ref(10)
const loading = ref(true)
const error = ref('')
const pipelineCandidate = ref<CandidateListItem | null>(null)
const activeJobs = ref<JobListItem[]>([])
const pipelineJobId = ref<number | null>(null)
const loadingJobs = ref(false)
const addingToPipeline = ref(false)
const pipelineMessage = ref('')
const pipelineError = ref('')

const canGoNext = computed(() => page.value * pageSize.value < pageInfo.value.total)
const canGoPrev = computed(() => page.value > 1)

async function loadCandidates() {
  loading.value = true
  error.value = ''
  try {
    const result = await api.listCandidates({ page: page.value, pageSize: pageSize.value })
    pageInfo.value = result
    items.value = result.items
  } catch (err) {
    error.value = err instanceof Error ? err.message : '候选人加载失败'
  } finally {
    loading.value = false
  }
}

function changePageSize() {
  page.value = 1
  void loadCandidates()
}

function goNext() {
  if (!canGoNext.value) return
  page.value += 1
  void loadCandidates()
}

function goPrev() {
  if (!canGoPrev.value) return
  page.value -= 1
  void loadCandidates()
}

async function openAddToPipeline(candidate: CandidateListItem) {
  pipelineCandidate.value = candidate
  pipelineJobId.value = null
  pipelineMessage.value = ''
  pipelineError.value = ''
  loadingJobs.value = true
  try {
    const result = await api.listJobs({ page: 1, pageSize: 50, status: 'active' })
    activeJobs.value = result.items
    pipelineJobId.value = result.items[0]?.id ?? null
    if (result.items.length === 0) {
      pipelineError.value = '暂无可选岗位，请先去招聘管理创建岗位，或联系管理员确认岗位是否已启用、分配给你。'
    }
  } catch (err) {
    pipelineError.value = err instanceof Error ? err.message : '岗位列表加载失败'
  } finally {
    loadingJobs.value = false
  }
}

async function submitAddToPipeline() {
  if (!pipelineCandidate.value || !pipelineJobId.value) {
    pipelineError.value = '请先选择一个有效岗位；如果没有岗位，请先去招聘管理创建或联系管理员分配。'
    return
  }
  const job = activeJobs.value.find(item => item.id === pipelineJobId.value)
  addingToPipeline.value = true
  pipelineMessage.value = ''
  pipelineError.value = ''
  try {
    await api.movePipeline({
      candidateId: pipelineCandidate.value.id,
      jobId: pipelineJobId.value,
      toStage: 'ai_screen',
    })
    pipelineMessage.value = `已将${pipelineCandidate.value.name_masked}加入 ${job?.title || '所选岗位'} 的 AI 初筛`
  } catch (err) {
    pipelineError.value = err instanceof Error ? err.message : '加入流程失败，请确认候选人、岗位和权限是否仍然有效。'
  } finally {
    addingToPipeline.value = false
  }
}

onMounted(async () => {
  await loadCandidates()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-display text-lg text-ink">候选人</h2>
        <p class="mt-1 text-sm text-muted">
          上传简历后会真实写入 Java rebuild 的 PostgreSQL dev 数据库（当前为同步写入候选人记录，简历内容暂以占位存储，尚未接真实解析链路），而不是只停留在前端临时态或刷新即丢。
        </p>
      </div>
      <label class="flex items-center gap-2 text-sm text-muted">
        每页
        <select
          v-model.number="pageSize"
          data-testid="page-size-select"
          class="rounded-lg border border-hairline bg-white px-2 py-1 text-body"
          @change="changePageSize"
        >
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
        </select>
      </label>
    </div>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else-if="items.length === 0" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
      <p>暂无候选人数据，请先上传简历。</p>
      <router-link to="/upload" class="mt-3 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
        去上传简历
      </router-link>
    </div>
    <div v-else class="bg-white rounded-xl shadow-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
            <th class="px-4 py-3 font-medium">姓名</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">创建时间</th>
            <th class="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-b border-hairline/50 hover:bg-surface-soft">
            <td class="px-4 py-3 text-body">{{ item.name_masked }}</td>
            <td class="px-4 py-3"><span class="text-xs bg-surface-soft px-2 py-0.5 rounded-full">{{ item.parse_status }}</span></td>
            <td class="px-4 py-3 text-muted">{{ item.created_at?.slice(0, 10) }}</td>
            <td class="px-4 py-3">
              <button
                type="button"
                :data-testid="`open-add-to-pipeline-${item.id}`"
                class="rounded-lg border border-hairline px-3 py-1 text-xs text-body hover:border-ink/30"
                @click="openAddToPipeline(item)"
              >
                加入流程
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <form
      v-if="pipelineCandidate"
      data-testid="submit-add-to-pipeline"
      class="bg-white rounded-xl shadow-card p-5 space-y-3"
      @submit.prevent="submitAddToPipeline"
    >
      <div>
        <h3 class="font-display text-base text-ink">加入流程</h3>
        <p class="mt-1 text-sm text-muted">
          将 {{ pipelineCandidate.name_masked }} 加入所选岗位的 AI 初筛。候选人负责人和本次推进人会按当前登录账号记录。
        </p>
      </div>
      <div class="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label class="text-sm text-muted">
          选择岗位
          <select
            v-model.number="pipelineJobId"
            data-testid="pipeline-job-select"
            class="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-body"
            :disabled="loadingJobs || activeJobs.length === 0"
          >
            <option v-for="job in activeJobs" :key="job.id" :value="job.id">
              {{ job.title }}
            </option>
          </select>
        </label>
        <button
          type="submit"
          class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          :disabled="addingToPipeline || loadingJobs || activeJobs.length === 0"
        >
          {{ addingToPipeline ? '加入中…' : '确认加入' }}
        </button>
      </div>
      <p v-if="loadingJobs" class="text-sm text-muted">正在加载有效岗位…</p>
      <p v-if="pipelineError" class="text-sm text-danger">{{ pipelineError }}</p>
      <div v-if="pipelineMessage" class="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
        <p>{{ pipelineMessage }}</p>
        <p class="mt-1">误推进后可去候选人流程看板查看历史并纠正。</p>
      </div>
    </form>
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
