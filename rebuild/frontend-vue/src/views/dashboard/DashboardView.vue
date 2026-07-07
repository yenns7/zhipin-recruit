<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/http'
import type { DashboardStatsResponse } from '@/types/api'

const auth = useAuthStore()

const stats = ref<DashboardStatsResponse>({
  activeJobs: 0,
  candidateTotal: 0,
  parsedCandidates: 0,
  adminOrManager: false,
})
const loading = ref(true)
const error = ref('')

const roleLabel = computed(() =>
  auth.role === 'recruiter'
    ? '招聘专员'
    : auth.role === 'manager'
      ? '招聘经理'
      : auth.role === 'admin'
        ? '管理员'
        : '面试官',
)

const showUploadHint = computed(() =>
  !stats.value.adminOrManager && stats.value.candidateTotal === 0,
)
const canManageTeam = computed(() => auth.role === 'manager' || auth.role === 'admin')

onMounted(async () => {
  try {
    stats.value = await api.getDashboardStats()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '工作台数据加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-xl shadow-card p-6">
      <h2 class="font-display text-lg text-ink mb-2">欢迎回来，{{ auth.name }}</h2>
      <p class="text-sm text-muted">当前角色：{{ roleLabel }}</p>
    </div>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white rounded-xl shadow-card p-5">
        <p class="text-xs text-muted mb-1">进行中岗位</p>
        <p class="font-display text-2xl text-ink">{{ loading ? '--' : stats.activeJobs }}</p>
      </div>
      <div class="bg-white rounded-xl shadow-card p-5">
        <p class="text-xs text-muted mb-1">候选人总数</p>
        <p class="font-display text-2xl text-ink">{{ loading ? '--' : stats.candidateTotal }}</p>
      </div>
      <div class="bg-white rounded-xl shadow-card p-5">
        <p class="text-xs text-muted mb-1">已解析候选人</p>
        <p class="font-display text-2xl text-ink">{{ loading ? '--' : stats.parsedCandidates }}</p>
      </div>
    </div>
    <div v-if="showUploadHint" class="bg-white rounded-xl shadow-card p-5 text-sm text-muted">
      当前还没有候选人数据，可以先上传简历，解析完成后再回到工作台查看推进情况。
      <router-link to="/upload" class="ml-2 font-medium text-ink">去上传简历</router-link>
    </div>
    <section v-if="canManageTeam" class="bg-white rounded-xl shadow-card p-5">
      <div class="mb-4">
        <h3 class="font-display text-base text-ink">团队看板</h3>
        <p class="mt-1 text-sm text-muted">
          试点阶段按岗位 owner_hr_id、候选人 owner_hr_id 和面试反馈 interviewer_id 对齐归属，避免“看得到但算不清”。
        </p>
      </div>
      <div class="grid gap-3 md:grid-cols-4">
        <div class="rounded-lg border border-hairline p-3">
          <p class="text-sm font-medium text-ink">岗位进展</p>
          <p class="mt-1 text-xs text-muted">从招聘管理和候选人流程看板检查每个岗位的候选人分布。</p>
        </div>
        <div class="rounded-lg border border-hairline p-3">
          <p class="text-sm font-medium text-ink">候选人归属</p>
          <p class="mt-1 text-xs text-muted">候选人列表和 BI 默认使用负责人范围，负责人分错需在试点记录中修正。</p>
        </div>
        <div class="rounded-lg border border-hairline p-3">
          <p class="text-sm font-medium text-ink">招聘专员绩效</p>
          <p class="mt-1 text-xs text-muted">先看上传、加入流程、推进和面试安排动作，后续补细分统计。</p>
        </div>
        <div class="rounded-lg border border-hairline p-3">
          <p class="text-sm font-medium text-ink">流程卡点</p>
          <p class="mt-1 text-xs text-muted">看板为空时先确认岗位有效、候选人已加入流程、面试官账号已启用。</p>
        </div>
      </div>
    </section>
  </div>
</template>
