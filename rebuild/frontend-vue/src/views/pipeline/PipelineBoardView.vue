<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { api } from '@/api/http'
import type {
  PipelineBoardCandidate,
  PipelineHistoryResponse,
  PipelineReviseResponse,
  RollbackPreview,
  PipelineCorrectionResponse,
} from '@/types/api'

const stages = ref<Record<string, PipelineBoardCandidate[]>>({})
const loading = ref(true)
const error = ref('')
const selectedCandidate = ref<PipelineBoardCandidate | null>(null)
const history = ref<PipelineHistoryResponse | null>(null)
const revision = ref<PipelineReviseResponse | null>(null)
const correctionReason = ref('')
const correctionNote = ref('')
const targetStage = ref('business_review')
const rollbackPreview = ref<RollbackPreview | null>(null)
const rollbackResult = ref<PipelineCorrectionResponse | null>(null)
const rollbackOpen = ref(false)

const STAGE_LABELS: Record<string, string> = {
  pending: '待处理',
  ai_screen: 'AI 初筛',
  business_review: '业务评估',
  interview: '面试中',
  offer: 'Offer',
  onboarded: '已入职',
  rejected: '已淘汰',
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: '创建流程',
  MOVED: '推进阶段',
  CORRECTED: '纠正阶段',
  ROLLBACK: '撤回阶段',
}

const selectedCandidateId = computed(() => selectedCandidate.value?.candidate_id ?? 0)

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '--'
  return STAGE_LABELS[stage] || stage
}

function isRollbackPreview(payload: unknown): payload is RollbackPreview {
  return Boolean(payload && typeof payload === 'object' && 'canRollback' in payload)
}

async function loadBoard() {
  const board = await api.getPipelineBoard(1)
  stages.value = board.stages
}

async function openCandidateActions(item: PipelineBoardCandidate) {
  selectedCandidate.value = item
  revision.value = null
  rollbackResult.value = null
  error.value = ''
  try {
    const payload = await api.getPipelineHistory(1, item.candidate_id)
    if (isRollbackPreview(payload)) {
      rollbackPreview.value = payload
      rollbackOpen.value = true
      history.value = null
      return
    }
    history.value = payload
    rollbackPreview.value = null
    targetStage.value = payload.currentStage === 'interview' ? 'business_review' : payload.currentStage
  } catch (err) {
    error.value = err instanceof Error ? err.message : '历史事件加载失败'
  }
}

async function submitCorrection() {
  if (!selectedCandidate.value) return
  error.value = ''
  try {
    revision.value = await api.revisePipeline({
      candidateId: selectedCandidate.value.candidate_id,
      jobId: 1,
      toStage: targetStage.value,
      reason: correctionReason.value,
      note: correctionNote.value,
    })
    await loadBoard()
    history.value = await api.getPipelineHistory(1, selectedCandidate.value.candidate_id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '流程纠正失败'
  }
}

async function confirmRollback() {
  if (!selectedCandidate.value) return
  error.value = ''
  try {
    rollbackResult.value = await api.rollbackPipeline(1, selectedCandidate.value.candidate_id)
    await loadBoard()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '撤回失败'
  }
}

onMounted(async () => {
  try {
    await loadBoard()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="font-display text-lg text-ink">候选人流程</h2>
      <p class="mt-1 text-sm text-muted">
        看板为空时先上传简历，再在候选人页把候选人加入岗位流程；误推进可查看历史并纠正，误淘汰、误关闭岗位和负责人分错目前仍需负责人或管理员记录后手动修正。
      </p>
    </div>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      <div v-for="(items, stage) in stages" :key="stage" class="bg-surface-card rounded-lg p-3 min-h-[200px]">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-muted">{{ stageLabel(String(stage)) }}</span>
          <span class="text-xs text-ink font-display">{{ items.length }}</span>
        </div>
        <div v-if="items.length === 0" class="text-xs text-muted-soft text-center py-4">
          暂无；先从候选人页加入流程
        </div>
        <div v-for="item in items" :key="item.candidate_id" class="bg-white rounded-lg p-2.5 mb-2 shadow-card text-xs">
          <p class="text-body font-medium truncate">{{ item.candidate_name }}</p>
          <p class="mt-1 text-muted">当前阶段：{{ stageLabel(item.stage) }}</p>
          <button
            v-if="item.stage === 'interview'"
            type="button"
            class="mt-2 rounded-lg border border-hairline px-2 py-1 text-xs text-body"
            @click="openCandidateActions(item)"
          >
            查看历史 / 撤回
          </button>
        </div>
      </div>
    </div>

    <section v-if="history" class="rounded-xl bg-white p-5 shadow-card">
      <div class="flex flex-col gap-1">
        <h3 class="font-display text-lg text-ink">历史事件流</h3>
        <p class="text-sm text-muted">当前阶段：{{ stageLabel(history.currentStage) }}</p>
        <p class="text-xs text-muted">{{ history.historyHint }}</p>
      </div>

      <ol class="mt-4 space-y-3">
        <li
          v-for="event in history.events"
          :key="`${event.eventType}-${event.happenedAt}`"
          class="rounded-lg border border-hairline p-3 text-sm"
        >
          <p class="font-medium text-ink">{{ EVENT_LABELS[event.eventType] || event.eventType }}</p>
          <p class="mt-1 text-muted">
            {{ stageLabel(event.fromStage) }} → {{ stageLabel(event.toStage) }}
          </p>
          <p v-if="event.note" class="mt-1 text-body">{{ event.note }}</p>
          <p v-if="event.reason" class="mt-1 text-body">{{ event.reason }}</p>
        </li>
      </ol>

      <form class="mt-5 grid gap-3 rounded-lg bg-surface-soft p-4" @submit.prevent="submitCorrection">
        <label class="text-sm text-body">
          纠正到
          <select v-model="targetStage" class="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2">
            <option value="pending">待处理</option>
            <option value="ai_screen">AI 初筛</option>
            <option value="business_review">业务评估</option>
            <option value="interview">面试中</option>
            <option value="offer">Offer</option>
            <option value="rejected">已淘汰</option>
          </select>
        </label>
        <textarea
          v-model="correctionReason"
          class="rounded-lg border border-hairline px-3 py-2 text-sm"
          placeholder="纠正原因"
        />
        <textarea
          v-model="correctionNote"
          class="rounded-lg border border-hairline px-3 py-2 text-sm"
          placeholder="备注"
        />
        <button type="submit" class="justify-self-start rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
          提交纠正
        </button>
      </form>

      <p v-if="revision" class="mt-3 text-sm text-emerald-700">
        {{ EVENT_LABELS[revision.eventType] || revision.eventType }}：{{ stageLabel(revision.fromStage) }} → {{ stageLabel(revision.toStage) }}
      </p>
    </section>

    <Teleport to="body">
      <div v-if="rollbackOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
        <section class="w-full max-w-lg rounded-xl bg-white p-5 shadow-card">
          <h3 class="font-display text-lg text-ink">候选人 {{ selectedCandidateId }} 撤回确认</h3>
          <p v-if="rollbackPreview?.canRollback" class="mt-3 text-sm text-body">
            {{ rollbackPreview.explanation }}
          </p>
          <p v-else class="mt-3 text-sm text-danger">
            {{ rollbackPreview?.reasonIfBlocked || '当前阶段无法回退。' }}
          </p>

          <ul v-if="rollbackPreview?.history?.length" class="mt-4 space-y-2 text-sm text-muted">
            <li v-for="item in rollbackPreview.history" :key="item.stageEntryId">
              {{ stageLabel(item.stage) }} · {{ item.operatorName || '系统' }}
            </li>
          </ul>

          <div v-if="rollbackResult" class="mt-4 rounded-lg bg-surface-soft p-3 text-sm text-body">
            <p>{{ rollbackResult.explanation }}</p>
            <p v-if="rollbackResult.interviewLink?.note" class="mt-1">{{ rollbackResult.interviewLink.note }}</p>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-hairline px-3 py-2 text-sm text-muted"
              @click="rollbackOpen = false"
            >
              关闭
            </button>
            <button
              v-if="rollbackPreview?.canRollback && !rollbackResult"
              type="button"
              class="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white"
              @click="confirmRollback"
            >
              确认撤回
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>
