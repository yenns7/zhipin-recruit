<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MatchRecommendationPanel from '@/components/match/MatchRecommendationPanel.vue'
import {
  getCandidateRecommendations,
  getJobRecommendations,
  listMatchCandidates,
  listMatchJobs,
  type MatchCandidateOption,
  type MatchJobOption,
  type MatchRecommendationCard,
} from '@/components/match/matchDemoApi'

const jobs = ref<MatchJobOption[]>([])
const candidates = ref<MatchCandidateOption[]>([])
const selectedJobId = ref<number | null>(null)
const selectedCandidateId = ref<number | null>(null)
const jobLoading = ref(true)
const candidateLoading = ref(true)
const jobGeneratedAt = ref<string | null>(null)
const candidateGeneratedAt = ref<string | null>(null)
const jobRecommendationCards = ref<MatchRecommendationCard[]>([])
const candidateRecommendationCards = ref<MatchRecommendationCard[]>([])

const jobOptions = computed(() =>
  jobs.value.map(item => ({
    id: item.id,
    label: item.title,
    hint: `${item.targetCandidateCount} 个演示推荐`,
  })),
)

const candidateOptions = computed(() =>
  candidates.value.map(item => ({
    id: item.id,
    label: item.name,
    hint: item.currentStage,
  })),
)

async function refreshJobRecommendations(jobId: number) {
  selectedJobId.value = jobId
  jobLoading.value = true
  try {
    const data = await getJobRecommendations(jobId)
    jobRecommendationCards.value = data.recommendations.map(item => ({
      id: item.candidateId,
      title: item.candidateName,
      subtitle: item.currentStage,
      score: item.score,
      reasons: item.reasons,
      nextAction: item.nextAction,
    }))
    jobGeneratedAt.value = data.generatedAt
  } finally {
    jobLoading.value = false
  }
}

async function refreshCandidateRecommendations(candidateId: number) {
  selectedCandidateId.value = candidateId
  candidateLoading.value = true
  try {
    const data = await getCandidateRecommendations(candidateId)
    candidateRecommendationCards.value = data.recommendations.map(item => ({
      id: item.jobId,
      title: item.jobTitle,
      subtitle: item.status === 'active' ? '招聘中' : '已关闭',
      score: item.score,
      reasons: item.reasons,
      nextAction: item.nextAction,
    }))
    candidateGeneratedAt.value = data.generatedAt
  } finally {
    candidateLoading.value = false
  }
}

onMounted(async () => {
  const jobData = await listMatchJobs()
  jobs.value = jobData.items
  if (jobs.value.length > 0) {
    await refreshJobRecommendations(jobs.value[0].id)
  } else {
    jobLoading.value = false
  }

  const candidateData = await listMatchCandidates()
  candidates.value = candidateData.items
  if (candidates.value.length > 0) {
    await refreshCandidateRecommendations(candidates.value[0].id)
  } else {
    candidateLoading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-2xl bg-white shadow-card border border-hairline p-6">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.2em] text-muted">Match Demo</p>
          <h1 class="font-display text-2xl text-ink">匹配推荐可解释规则演示</h1>
          <p class="max-w-3xl text-sm text-muted">
            当前页面使用本地规则和演示数据，帮助在重构版里展示“岗位看到推荐候选人，候选人看到匹配岗位”的可解释推荐闭环。
          </p>
          <p class="mt-2 text-xs text-muted">
            <strong class="text-ink">数据范围说明：</strong>招聘专员在本页面看到的岗位仅限自己负责范围内的数据；候选人也仅限与这些岗位相关的人选。管理员和招聘经理可查看全量演示数据。
          </p>
        </div>
        <div class="rounded-xl bg-surface-soft px-4 py-3 text-sm text-body">
          <p class="font-medium text-ink">演示说明</p>
          <p>这是只读推荐视图，推荐分会结合岗位信息、候选人背景和当前流程状态生成，不会触发任何 AI 写操作。</p>
        </div>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-2">
      <MatchRecommendationPanel
        title="岗位推荐候选人"
        description="先按岗位查看演示推荐候选人，再决定是否进入初筛或面试安排。"
        select-label="选择岗位"
        :options="jobOptions"
        :selected-id="selectedJobId"
        :loading="jobLoading"
        loading-label="正在加载岗位推荐候选人…"
        empty-label="当前没有可展示的岗位推荐，请稍后补充演示数据。"
        :recommendations="jobRecommendationCards"
        :generated-at="jobGeneratedAt"
        @change="refreshJobRecommendations"
      />

      <MatchRecommendationPanel
        title="候选人匹配岗位"
        description="从候选人视角查看更适合推进的岗位，便于招聘专员做下一步引导。"
        select-label="选择候选人"
        :options="candidateOptions"
        :selected-id="selectedCandidateId"
        :loading="candidateLoading"
        loading-label="正在加载候选人匹配岗位…"
        empty-label="当前没有可展示的候选人匹配岗位，请稍后补充演示数据。"
        :recommendations="candidateRecommendationCards"
        :generated-at="candidateGeneratedAt"
        @change="refreshCandidateRecommendations"
      />
    </div>
  </div>
</template>
