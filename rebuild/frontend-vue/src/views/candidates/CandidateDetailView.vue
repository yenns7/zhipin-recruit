<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getToken } from '@/api/http'
import type { CandidateDetailResponse } from '@/types/api'

type CandidateDetailViewModel = CandidateDetailResponse & Partial<{
  highestEducation: string | null
  yearsOfExperience: number | string | null
  currentCompany: string | null
  currentTitle: string | null
  city: string | null
  coreSkills: string[] | string | null
  profileSummary: string | null
  lastResumeParseSummary: string | null
  pipelines: CandidateDetailResponse['pipelineRecords']
}>

const route = useRoute()
const router = useRouter()
const candidateId = Number(route.params.candidateId)

const detail = ref<CandidateDetailViewModel | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const STAGE_LABELS: Record<string, string> = {
  SCREENING: '简历筛选',
  INTERVIEW: '面试中',
  OFFER: 'Offer',
  HIRED: '已录用',
  REJECTED: '已淘汰',
}

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] || stage
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  return value.replace('T', ' ').replace('Z', '').slice(0, 16)
}

function normalizeText(value?: string | null): string {
  return value?.trim() || ''
}

function formatExperience(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return `${value} 年`

  const normalized = value.trim()
  if (!normalized) return ''
  return /年|yrs?|years?/i.test(normalized) ? normalized : `${normalized} 年`
}

const pipelineTimeline = computed(() => {
  if (!detail.value) return []
  return detail.value.pipelines?.length ? detail.value.pipelines : detail.value.pipelineRecords
})

const latestPipelineRecord = computed(() => {
  const records = pipelineTimeline.value
  return records.length > 0 ? records[records.length - 1] : null
})

const latestStageLabel = computed(() => {
  if (!detail.value?.currentStage) return '暂无流程记录'
  return stageLabel(detail.value.currentStage)
})

const processSummary = computed(() => {
  if (!detail.value) return ''
  if (detail.value.pipelineStageCount === 0) {
    return '尚未进入招聘流程，建议先确认目标岗位。'
  }
  return `共推进 ${detail.value.pipelineStageCount} 次，涉及 ${detail.value.activeJobCount} 个岗位`
})

const resumeHighlights = computed(() => {
  if (!detail.value) return []

  const currentRole = [normalizeText(detail.value.currentCompany), normalizeText(detail.value.currentTitle)]
    .filter(Boolean)
    .join(' / ')

  return [
    { label: '最高学历', value: normalizeText(detail.value.highestEducation) },
    { label: '工作年限', value: formatExperience(detail.value.yearsOfExperience) },
    { label: '当前职级', value: currentRole },
    { label: '所在城市', value: normalizeText(detail.value.city) },
  ].filter(item => item.value)
})

const coreSkills = computed(() => {
  const rawSkills = detail.value?.coreSkills
  if (Array.isArray(rawSkills)) {
    return rawSkills.map(skill => skill.trim()).filter(Boolean)
  }
  if (typeof rawSkills === 'string') {
    return rawSkills
      .split(/[、,，/]/)
      .map(skill => skill.trim())
      .filter(Boolean)
  }
  return []
})

const profileSummary = computed(() => normalizeText(detail.value?.profileSummary))

const hasStructuredResumeContext = computed(() => {
  return resumeHighlights.value.length > 0 || coreSkills.value.length > 0 || Boolean(profileSummary.value)
})

const recentParseConclusion = computed(() => {
  const summary = normalizeText(detail.value?.lastResumeParseSummary)
  return summary || '当前没有最近解析结论，建议补充简历解析或手动完善候选人亮点。'
})

const progressionSuggestions = computed(() => {
  if (!detail.value) return []

  const suggestions: string[] = []
  const jobTitle = detail.value.currentJobTitle || '目标岗位'
  const skillsPreview = coreSkills.value.slice(0, 2).join('、')

  if (!detail.value.inPipeline) {
    suggestions.push('建议先绑定目标岗位，再决定是否进入初筛流程。')
  } else {
    suggestions.push(`候选人已进入${latestStageLabel.value}，建议围绕最近解析结论校准本轮评估重点。`)
  }

  if (skillsPreview) {
    suggestions.push(`优先核实 ${skillsPreview} 与${jobTitle}的岗位要求匹配度。`)
  } else {
    suggestions.push('缺少核心技能标签，建议先补充技能关键词再推进。')
  }

  if (!normalizeText(detail.value.lastResumeParseSummary)) {
    suggestions.push('当前没有最近解析结论，建议补充简历解析或手动完善候选人亮点。')
  } else if (!detail.value.inPipeline) {
    suggestions.push('最近解析已给出初步判断，建议结合目标岗位尽快完成首轮筛选。')
  } else {
    suggestions.push('最近解析已沉淀明确结论，可直接作为业务面或面试复盘的对照依据。')
  }

  return suggestions
})

async function loadDetail() {
  loading.value = true
  error.value = null

  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const res = await fetch(`/api/v1/candidates/${candidateId}`, { headers })
    if (!res.ok) {
      throw new Error(`请求失败 (${res.status})`)
    }
    const body = await res.json()
    detail.value = body.data as CandidateDetailViewModel
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'Candidates' })
}

onMounted(loadDetail)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <button
        class="inline-flex items-center gap-1 rounded-lg border border-hairline bg-white px-3 py-2 text-xs font-medium text-body transition hover:border-ink/30 hover:text-ink"
        type="button"
        @click="goBack"
      >
        &larr; 返回候选人列表
      </button>
    </div>

    <div v-if="loading" class="text-sm text-muted">加载中…</div>

    <div v-else-if="error" class="rounded-xl bg-white p-8 text-center shadow-card">
      <p class="text-sm text-red-500">{{ error }}</p>
    </div>

    <template v-else-if="detail">
      <div class="rounded-2xl bg-white p-6 shadow-card">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <div class="space-y-1">
              <p class="text-xs uppercase tracking-[0.2em] text-muted">候选人档案</p>
              <h2 class="font-display text-2xl text-ink">{{ detail.nameMasked }}</h2>
            </div>
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="rounded-full bg-surface-soft px-3 py-1 text-body">{{ detail.parseStatus }}</span>
              <span
                class="rounded-full px-3 py-1"
                :class="detail.inPipeline ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'"
              >
                {{ detail.inPipeline ? '已在流程中' : '未入池' }}
              </span>
              <span class="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{{ detail.sourceLabel }}</span>
            </div>
          </div>
          <div class="grid min-w-full grid-cols-2 gap-3 text-sm sm:min-w-[22rem]">
            <div class="rounded-xl border border-hairline bg-surface-soft/40 p-3">
              <p class="text-xs text-muted">创建时间</p>
              <p class="mt-1 text-body">{{ formatDate(detail.createdAt) }}</p>
            </div>
            <div class="rounded-xl border border-hairline bg-surface-soft/40 p-3">
              <p class="text-xs text-muted">最近更新时间</p>
              <p class="mt-1 text-body">{{ formatDate(detail.latestUpdatedAt) }}</p>
            </div>
            <div class="rounded-xl border border-hairline bg-surface-soft/40 p-3">
              <p class="text-xs text-muted">当前阶段</p>
              <p class="mt-1 text-body">{{ latestStageLabel }}</p>
            </div>
            <div class="rounded-xl border border-hairline bg-surface-soft/40 p-3">
              <p class="text-xs text-muted">当前岗位</p>
              <p class="mt-1 text-body">{{ detail.currentJobTitle || '待确认目标岗位' }}</p>
            </div>
          </div>
        </div>

        <dl class="mt-6 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div class="rounded-xl border border-hairline p-4">
            <dt class="text-xs text-muted">邮箱</dt>
            <dd class="mt-1 text-body">{{ detail.emailMasked }}</dd>
          </div>
          <div class="rounded-xl border border-hairline p-4">
            <dt class="text-xs text-muted">电话</dt>
            <dd class="mt-1 text-body">{{ detail.phoneMasked }}</dd>
          </div>
          <div class="rounded-xl border border-hairline p-4">
            <dt class="text-xs text-muted">流程摘要</dt>
            <dd class="mt-1 text-body">{{ processSummary }}</dd>
          </div>
        </dl>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.9fr)]">
        <div class="rounded-2xl bg-white p-6 shadow-card">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="font-display text-base text-ink">简历速览</h3>
              <p class="mt-1 text-sm text-muted">用结构化信息快速判断候选人的履历轮廓与岗位匹配线索。</p>
            </div>
            <div class="rounded-xl bg-surface-soft px-4 py-3 text-right text-sm">
              <p class="text-xs text-muted">当前判断</p>
              <p class="mt-1 font-medium text-ink">{{ detail.inPipeline ? '值得继续推进' : '待确认岗位匹配' }}</p>
            </div>
          </div>

          <div v-if="hasStructuredResumeContext" class="mt-4 space-y-4">
            <dl v-if="resumeHighlights.length > 0" class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div
                v-for="item in resumeHighlights"
                :key="item.label"
                class="rounded-xl border border-hairline bg-surface-soft/30 p-4"
              >
                <dt class="text-xs text-muted">{{ item.label }}</dt>
                <dd class="mt-1 text-sm font-medium text-body">{{ item.value }}</dd>
              </div>
            </dl>

            <div v-if="coreSkills.length > 0">
              <p class="text-xs text-muted">核心技能</p>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                <span
                  v-for="skill in coreSkills"
                  :key="skill"
                  class="rounded-full bg-blue-50 px-3 py-1 text-blue-700"
                >
                  {{ skill }}
                </span>
              </div>
            </div>

            <div>
              <p class="text-xs text-muted">履历摘要</p>
              <p class="mt-2 rounded-xl border border-hairline bg-white p-4 text-sm leading-6 text-body">
                {{ profileSummary || '暂无履历摘要，可结合最近解析结论和原始简历补充判断。' }}
              </p>
            </div>
          </div>

          <div
            v-else
            class="mt-4 rounded-xl border border-dashed border-hairline bg-surface-soft/30 p-5 text-sm text-muted"
          >
            <p class="font-medium text-body">暂无结构化简历信息</p>
            <p class="mt-2">可以先补充简历解析结果，或在候选人档案里完善教育、经历和技能关键词。</p>
          </div>
        </div>

        <div class="grid gap-4">
          <div class="rounded-2xl bg-white p-6 shadow-card">
            <h3 class="font-display text-base text-ink">继续推进建议</h3>
            <p class="mt-1 text-sm text-muted">基于当前流程、技能标签和最近解析结论，给出下一步判断提示。</p>
            <ul class="mt-4 space-y-3 text-sm text-body">
              <li
                v-for="suggestion in progressionSuggestions"
                :key="suggestion"
                class="rounded-xl border border-hairline bg-surface-soft/20 p-4"
              >
                {{ suggestion }}
              </li>
            </ul>
          </div>

          <div class="rounded-2xl bg-white p-6 shadow-card">
            <h3 class="font-display text-base text-ink">最近解析结论</h3>
            <p class="mt-1 text-sm text-muted">优先看最近一次简历解析沉淀出的判断，再决定是否继续推进。</p>
            <div class="mt-4 rounded-xl border border-hairline bg-surface-soft/20 p-4 text-sm leading-6 text-body">
              {{ recentParseConclusion }}
            </div>
            <div
              v-if="latestPipelineRecord"
              class="mt-4 rounded-xl border border-hairline border-dashed bg-white p-4 text-xs text-muted"
            >
              最近推进到
              <span class="font-medium text-body">{{ stageLabel(latestPipelineRecord.stage) }}</span>
              <span class="mx-1">·</span>
              <span>{{ latestPipelineRecord.jobTitle }}</span>
              <span class="mx-1">·</span>
              <span>{{ formatDate(latestPipelineRecord.ts) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.9fr)]">
        <div class="rounded-2xl bg-white p-6 shadow-card">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="font-display text-base text-ink">来源与流程摘要</h3>
              <p class="mt-1 text-sm text-muted">{{ detail.sourceDetail }}</p>
            </div>
            <div class="rounded-xl bg-surface-soft px-4 py-3 text-right text-sm">
              <p class="text-xs text-muted">最近阶段</p>
              <p class="mt-1 font-medium text-ink">{{ latestStageLabel }}</p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div class="rounded-xl border border-hairline p-4">
              <p class="text-xs text-muted">来源渠道</p>
              <p class="mt-1 text-body">{{ detail.sourceLabel }}</p>
            </div>
            <div class="rounded-xl border border-hairline p-4">
              <p class="text-xs text-muted">推进次数</p>
              <p class="mt-1 text-body">共推进 {{ detail.pipelineStageCount }} 次</p>
            </div>
            <div class="rounded-xl border border-hairline p-4">
              <p class="text-xs text-muted">岗位覆盖</p>
              <p class="mt-1 text-body">涉及 {{ detail.activeJobCount }} 个岗位</p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl bg-white p-6 shadow-card">
          <h3 class="font-display text-base text-ink">下一步入口</h3>
          <p class="mt-1 text-sm text-muted">
            {{ detail.inPipeline ? '继续查看流程进度或回到岗位池补充判断。' : '可以先去岗位管理确认目标岗位，再回到流程看板推进。' }}
          </p>
          <div class="mt-4 grid gap-3">
            <button
              class="inline-flex items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
              type="button"
              @click="router.push({ name: 'Pipeline' })"
            >
              去招聘流程看板
            </button>
            <button
              class="inline-flex items-center justify-center rounded-xl border border-hairline bg-white px-4 py-3 text-sm font-medium text-body transition hover:border-ink/30 hover:text-ink"
              type="button"
              @click="router.push({ name: 'Jobs' })"
            >
              查看岗位池
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-2xl bg-white shadow-card">
        <div class="px-6 py-4 border-b border-hairline">
          <h3 class="font-display text-base text-ink">招聘流程记录</h3>
        </div>
        <div v-if="detail.pipelineRecords.length === 0" class="px-6 py-8 text-center text-sm text-muted">
          <p class="text-body">该候选人还没有进入招聘流程。</p>
          <p class="mt-2">可以先去岗位管理确认目标岗位，再回到招聘流程看板推进。</p>
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
              <th class="px-6 py-3 font-medium">岗位</th>
              <th class="px-6 py-3 font-medium">阶段</th>
              <th class="px-6 py-3 font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in detail.pipelineRecords"
              :key="record.stageId"
              class="border-b border-hairline/50 hover:bg-surface-soft"
            >
              <td class="px-6 py-3 text-body">{{ record.jobTitle }}</td>
              <td class="px-6 py-3">
                <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  {{ stageLabel(record.stage) }}
                </span>
              </td>
              <td class="px-6 py-3 text-muted">{{ formatDate(record.ts) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
