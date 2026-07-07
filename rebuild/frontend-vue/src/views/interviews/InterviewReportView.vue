<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/http'
import type { InterviewDetailItem } from '@/types'

const route = useRoute()
const router = useRouter()

const interview = ref<InterviewDetailItem | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

type QaEntry = {
  question: string
  answer: string
}

type StructuredReport = {
  summary: string
  highlights: string[]
  concerns: string[]
  notes: string[]
}

function parseJson<T>(raw?: string) {
  if (!raw || !raw.trim()) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          return normalizeText(
            (item as Record<string, unknown>).text ??
              (item as Record<string, unknown>).value ??
              (item as Record<string, unknown>).content
          )
        }
        return ''
      })
      .filter(Boolean)
  }
  const single = normalizeText(value)
  return single ? [single] : []
}

function splitPlainTextSections(raw?: string): StructuredReport {
  const lines = (raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const result: StructuredReport = {
    summary: '',
    highlights: [],
    concerns: [],
    notes: [],
  }

  for (const line of lines) {
    const normalized = line.replace(/^[•\-\d.\s]+/, '')
    if (/^(亮点|优势|表现优秀|做得好)[:：]/.test(line)) {
      result.highlights.push(normalized.replace(/^(亮点|优势|表现优秀|做得好)[:：]/, '').trim())
      continue
    }
    if (/^(顾虑|风险|待提升|担忧)[:：]/.test(line)) {
      result.concerns.push(normalized.replace(/^(顾虑|风险|待提升|担忧)[:：]/, '').trim())
      continue
    }
    if (/^(备注|建议|补充|后续关注)[:：]/.test(line)) {
      result.notes.push(normalized.replace(/^(备注|建议|补充|后续关注)[:：]/, '').trim())
      continue
    }
    if (!result.summary) {
      result.summary = normalized
    } else {
      result.notes.push(normalized)
    }
  }

  return result
}

function parseReport(raw?: string): StructuredReport {
  const parsed = parseJson<Record<string, unknown>>(raw)
  if (parsed && !Array.isArray(parsed)) {
    return {
      summary:
        normalizeText(parsed.summary) ||
        normalizeText(parsed.overview) ||
        normalizeText(parsed.conclusion) ||
        normalizeText(parsed.report),
      highlights: normalizeList(parsed.highlights ?? parsed.strengths ?? parsed.positives),
      concerns: normalizeList(parsed.concerns ?? parsed.risks ?? parsed.improvements),
      notes: normalizeList(parsed.notes ?? parsed.recommendations ?? parsed.comments),
    }
  }

  const plainText = normalizeText(raw)
  if (!plainText) {
    return {
      summary: '',
      highlights: [],
      concerns: [],
      notes: [],
    }
  }

  return splitPlainTextSections(plainText)
}

function parseQaEntries(raw?: string): QaEntry[] {
  const parsed = parseJson<unknown>(raw)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as Record<string, unknown>
      const question =
        normalizeText(record.q) ||
        normalizeText(record.question) ||
        normalizeText(record.prompt)
      const answer =
        normalizeText(record.a) ||
        normalizeText(record.answer) ||
        normalizeText(record.response)
      if (!question && !answer) {
        return null
      }
      return {
        question: question || '问题未记录',
        answer: answer || '回答未记录',
      }
    })
    .filter((item): item is QaEntry => Boolean(item))
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return '--'
  }
  if (value.includes('T')) {
    const date = value.slice(0, 10)
    const time = value.slice(11, 16)
    return time ? `${date} ${time}` : date
  }
  return value
}

async function loadInterview() {
  loading.value = true
  error.value = null
  try {
    const id = Number(route.params.interviewId)
    if (!id) {
      error.value = '无效的面试 ID'
      return
    }
    const response = await api.getInterview(id)
    // Backend wraps data in ApiResponse { code, message, data }
    const raw =
      response && typeof response === 'object' && 'data' in response
        ? (response as any).data
        : response
    interview.value = raw ?? null
    if (!interview.value) {
      error.value = '未找到面试记录'
    }
  } catch {
    error.value = '加载面试报告失败'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'Interviews' })
}

const report = computed(() => parseReport(interview.value?.aiReport))
const qaEntries = computed(() => parseQaEntries(interview.value?.qaJson))
const rawQaText = computed(() => {
  const value = normalizeText(interview.value?.qaJson)
  return qaEntries.value.length ? '' : value
})
const hasSubmittedFeedback = computed(() => {
  const current = interview.value
  if (!current) {
    return false
  }
  return Boolean(
    current.score !== null ||
      current.passRecommended !== null ||
      report.value.summary ||
      report.value.highlights.length ||
      report.value.concerns.length ||
      report.value.notes.length ||
      qaEntries.value.length ||
      rawQaText.value
  )
})
const feedbackStatusLabel = computed(() => (hasSubmittedFeedback.value ? '反馈已提交' : '反馈待提交'))
const feedbackStatusClass = computed(() =>
  hasSubmittedFeedback.value
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
    : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
)
const submittedAtLabel = computed(() => formatDateLabel(interview.value?.createdAt))
const summaryText = computed(() => {
  if (hasSubmittedFeedback.value) {
    return report.value.summary || '已提交面试反馈，可结合下方亮点、顾虑和问答记录快速复盘。'
  }
  return '面试官尚未提交反馈，请尽快完成评分、结论与备注，避免候选人推进和协作判断受阻。'
})
const recommendationText = computed(() => {
  const current = interview.value
  if (!current || current.passRecommended === null) {
    return '待补充'
  }
  return current.passRecommended ? '推荐进入下一轮' : '暂不建议进入下一轮'
})

onMounted(loadInterview)
</script>

<template>
  <div class="space-y-6">
    <!-- Back button -->
    <button
      class="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
      type="button"
      @click="goBack"
    >
      <span aria-hidden="true">&larr;</span> 返回面试列表
    </button>

    <!-- Loading state -->
    <div v-if="loading" class="rounded-xl bg-white p-8 text-center text-sm text-muted shadow-card">
      加载中…
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded-xl bg-white p-8 text-center shadow-card">
      <p class="text-sm text-red-500">{{ error }}</p>
      <button
        class="mt-3 inline-flex items-center rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-body transition hover:border-ink/30"
        type="button"
        @click="loadInterview"
      >
        重新加载
      </button>
    </div>

    <!-- Report content -->
    <template v-else-if="interview">
      <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div class="rounded-2xl bg-white p-6 shadow-card">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">报告摘要</p>
              <h2 class="mt-2 font-display text-2xl text-ink">面试报告</h2>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-body">
                {{ summaryText }}
              </p>
            </div>
            <span
              class="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
              :class="feedbackStatusClass"
            >
              {{ feedbackStatusLabel }}
            </span>
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl bg-surface-soft px-4 py-3">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">反馈状态</p>
              <p class="mt-2 text-sm font-semibold text-ink">{{ feedbackStatusLabel }}</p>
            </div>
            <div class="rounded-xl bg-surface-soft px-4 py-3">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">提交时间</p>
              <p class="mt-2 text-sm font-semibold text-ink">{{ submittedAtLabel }}</p>
            </div>
            <div class="rounded-xl bg-surface-soft px-4 py-3">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">报告编号</p>
              <p class="mt-2 text-sm font-semibold text-ink">#{{ interview.id }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl bg-white p-6 shadow-card">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">结论概览</p>
          <div class="mt-4 grid gap-4">
            <div class="rounded-xl border border-hairline px-4 py-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">综合评分</p>
              <p class="mt-2 font-display text-3xl text-ink">
                {{ interview.score !== null ? interview.score : '--' }}
                <span v-if="interview.score !== null" class="text-base font-normal text-muted">/ 5</span>
              </p>
            </div>
            <div class="rounded-xl border border-hairline px-4 py-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">结论建议</p>
              <p
                class="mt-2 text-lg font-semibold"
                :class="interview.passRecommended === true ? 'text-green-600' : interview.passRecommended === false ? 'text-red-500' : 'text-amber-600'"
              >
                {{ recommendationText }}
              </p>
              <p class="mt-1 text-sm text-muted">
                {{ interview.passRecommended === true ? '是' : interview.passRecommended === false ? '否' : '--' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="!hasSubmittedFeedback"
        class="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-card"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-amber-800">反馈待提交</p>
            <p class="mt-1 text-sm leading-6 text-amber-700">
              面试官尚未提交反馈，请尽快完成评分、结论与备注，确保候选人后续推进有明确依据。
            </p>
          </div>
          <span class="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700">
            请尽快完成评分、结论与备注
          </span>
        </div>
      </div>

      <div class="rounded-2xl bg-white p-6 shadow-card">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">关键信息</p>
            <h3 class="mt-2 font-display text-lg text-ink">基础面试信息</h3>
          </div>
        </div>
        <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-xl bg-surface-soft px-4 py-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">候选人</p>
            <p class="mt-2 text-sm font-semibold text-ink">
              {{ interview.candidateName || `候选人 #${interview.candidateId}` }}
            </p>
          </div>
          <div class="rounded-xl bg-surface-soft px-4 py-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">岗位</p>
            <p class="mt-2 text-sm font-semibold text-ink">
              {{ interview.jobTitle || `岗位 #${interview.jobId}` }}
            </p>
          </div>
          <div class="rounded-xl bg-surface-soft px-4 py-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">面试官</p>
            <p class="mt-2 text-sm font-semibold text-ink">
              {{ interview.interviewerId ? `面试官 #${interview.interviewerId}` : '待补充' }}
            </p>
          </div>
          <div class="rounded-xl bg-surface-soft px-4 py-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">反馈时间</p>
            <p class="mt-2 text-sm font-semibold text-ink">{{ submittedAtLabel }}</p>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">亮点</p>
          <ul
            v-if="report.highlights.length"
            class="mt-4 space-y-3 text-sm leading-6 text-body"
          >
            <li
              v-for="item in report.highlights"
              :key="item"
              class="rounded-xl bg-emerald-50 px-4 py-3"
            >
              {{ item }}
            </li>
          </ul>
          <p v-else class="mt-4 rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
            暂未记录亮点。
          </p>
        </div>

        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">顾虑</p>
          <ul
            v-if="report.concerns.length"
            class="mt-4 space-y-3 text-sm leading-6 text-body"
          >
            <li
              v-for="item in report.concerns"
              :key="item"
              class="rounded-xl bg-rose-50 px-4 py-3"
            >
              {{ item }}
            </li>
          </ul>
          <p v-else class="mt-4 rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
            暂未记录顾虑。
          </p>
        </div>

        <div class="rounded-2xl bg-white p-5 shadow-card">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">备注</p>
          <ul
            v-if="report.notes.length"
            class="mt-4 space-y-3 text-sm leading-6 text-body"
          >
            <li
              v-for="item in report.notes"
              :key="item"
              class="rounded-xl bg-sky-50 px-4 py-3"
            >
              {{ item }}
            </li>
          </ul>
          <p v-else class="mt-4 rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
            暂无补充备注。
          </p>
        </div>
      </div>

      <div
        v-if="qaEntries.length || rawQaText"
        class="rounded-2xl bg-white p-6 shadow-card"
      >
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted">问答记录</p>
        <div v-if="qaEntries.length" class="mt-4 space-y-4">
          <div
            v-for="entry in qaEntries"
            :key="`${entry.question}-${entry.answer}`"
            class="rounded-xl border border-hairline px-4 py-4"
          >
            <p class="text-xs font-medium uppercase tracking-wide text-muted">问题</p>
            <p class="mt-2 text-sm font-semibold text-ink">{{ entry.question }}</p>
            <p class="mt-4 text-xs font-medium uppercase tracking-wide text-muted">回答</p>
            <p class="mt-2 text-sm leading-6 text-body">{{ entry.answer }}</p>
          </div>
        </div>
        <div
          v-else
          class="mt-4 rounded-xl bg-surface-soft px-4 py-4 text-sm leading-6 text-body"
        >
          {{ rawQaText }}
        </div>
      </div>
    </template>
  </div>
</template>
