<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError, api } from '@/api/http'
import type { ResumeUploadResult } from '@/types/api'

const acceptedTypes = '.pdf,.doc,.docx,.zip'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 60000

type UploadTaskItem = ResumeUploadResult & {
  hint?: string
}

const selectedFiles = ref<File[]>([])
const uploading = ref(false)
const error = ref('')
const results = ref<UploadTaskItem[]>([])
const batchId = ref<number | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const refreshingTaskIds = ref<string[]>([])

const pollTimeoutHandles = new Map<string, ReturnType<typeof setTimeout>>()
const pollStartedAt = new Map<string, number>()
const inFlightTaskIds = new Set<string>()

const hasFiles = computed(() => selectedFiles.value.length > 0)

const summary = computed(() => {
  return results.value.reduce(
    (acc, item) => {
      if (item.status === 'PARSED' || item.status === 'ok') acc.ok += 1
      else if (item.status === 'PENDING') acc.pending += 1
      else if (item.status === 'PROCESSING') acc.processing += 1
      else if (item.status === 'skipped') acc.skipped += 1
      else acc.error += 1
      return acc
    },
    { ok: 0, pending: 0, processing: 0, skipped: 0, error: 0 },
  )
})

const activeTaskCount = computed(
  () => summary.value.pending + summary.value.processing,
)

const resultsHeadline = computed(() => {
  return activeTaskCount.value > 0 ? '解析进行中' : '上传完成'
})

const summaryText = computed(() => {
  const segments = [`成功 ${summary.value.ok} 份`]
  if (summary.value.pending) segments.push(`等待解析 ${summary.value.pending} 份`)
  if (summary.value.processing) segments.push(`处理中 ${summary.value.processing} 份`)
  if (summary.value.skipped) segments.push(`跳过 ${summary.value.skipped} 份`)
  segments.push(`失败 ${summary.value.error} 份`)
  if (batchId.value !== null) segments.push(`批次 ID ${batchId.value}`)
  return segments.join('，')
})

function getTaskId(item: Pick<ResumeUploadResult, 'task_id'>): string | null {
  return item.task_id ? String(item.task_id) : null
}

function isTaskTerminal(status: ResumeUploadResult['status']) {
  return ['PARSED', 'FAILED', 'ok', 'skipped', 'error'].includes(status)
}

function shouldAutoPoll(status: ResumeUploadResult['status']) {
  return status === 'PENDING' || status === 'PROCESSING'
}

function getStatusLabel(status: ResumeUploadResult['status']) {
  switch (status) {
    case 'PENDING':
      return '等待解析'
    case 'PROCESSING':
      return '处理中'
    case 'PARSED':
    case 'ok':
      return '解析完成'
    case 'skipped':
      return '跳过'
    case 'FAILED':
    case 'error':
    default:
      return '失败'
  }
}

function getStatusClass(status: ResumeUploadResult['status']) {
  if (status === 'PARSED' || status === 'ok') return 'bg-success/10 text-success'
  if (status === 'PENDING' || status === 'PROCESSING') return 'bg-warning/10 text-warning'
  if (status === 'skipped') return 'bg-surface-soft text-muted'
  return 'bg-danger/10 text-danger'
}

function isTaskRefreshing(taskId?: string) {
  if (!taskId) return false
  return refreshingTaskIds.value.includes(String(taskId))
}

function markTaskRefreshing(taskId: string, refreshing: boolean) {
  if (refreshing) {
    if (!refreshingTaskIds.value.includes(taskId)) {
      refreshingTaskIds.value = [...refreshingTaskIds.value, taskId]
    }
    return
  }
  refreshingTaskIds.value = refreshingTaskIds.value.filter(id => id !== taskId)
}

function clearScheduledPoll(taskId: string) {
  const timeout = pollTimeoutHandles.get(taskId)
  if (timeout) {
    clearTimeout(timeout)
    pollTimeoutHandles.delete(taskId)
  }
}

function stopPolling(taskId: string) {
  clearScheduledPoll(taskId)
  pollStartedAt.delete(taskId)
}

function stopAllPolling() {
  Array.from(pollTimeoutHandles.keys()).forEach(stopPolling)
}

function findResultIndex(target: Pick<ResumeUploadResult, 'file' | 'task_id'>) {
  const taskId = getTaskId(target)
  if (taskId) {
    const matchedIndex = results.value.findIndex(item => getTaskId(item) === taskId)
    if (matchedIndex >= 0) return matchedIndex
  }
  return results.value.findIndex(item => item.file === target.file)
}

function updateResultItem(nextItem: UploadTaskItem) {
  const index = findResultIndex(nextItem)
  if (index < 0) {
    results.value = [...results.value, nextItem]
    return nextItem
  }

  const current = results.value[index]
  const merged: UploadTaskItem = {
    ...current,
    ...nextItem,
    task_id: nextItem.task_id ?? current.task_id,
    file: nextItem.file || current.file,
    hint: nextItem.hint ?? current.hint,
  }

  results.value = results.value.map((item, itemIndex) => (itemIndex === index ? merged : item))
  return merged
}

function setTaskHint(taskId: string, hint: string) {
  const index = results.value.findIndex(item => getTaskId(item) === taskId)
  if (index < 0) return
  const current = results.value[index]
  results.value = results.value.map((item, itemIndex) =>
    itemIndex === index ? { ...current, hint } : item,
  )
}

function schedulePoll(item: UploadTaskItem) {
  const taskId = getTaskId(item)
  if (!taskId || !shouldAutoPoll(item.status)) return

  const startedAt = pollStartedAt.get(taskId) ?? Date.now()
  pollStartedAt.set(taskId, startedAt)

  if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
    stopPolling(taskId)
    setTaskHint(taskId, '自动刷新已停止，请手动刷新查看最新状态。')
    return
  }

  clearScheduledPoll(taskId)
  pollTimeoutHandles.set(
    taskId,
    setTimeout(() => {
      void refreshTask(taskId)
    }, POLL_INTERVAL_MS),
  )
}

async function refreshTask(taskId: string) {
  if (inFlightTaskIds.has(taskId)) return

  const currentItem = results.value.find(item => getTaskId(item) === taskId)
  if (!currentItem) return

  inFlightTaskIds.add(taskId)
  markTaskRefreshing(taskId, true)
  clearScheduledPoll(taskId)

  try {
    const response = await api.getResumeUploadTask(taskId)
    const nextItem = updateResultItem({
      ...currentItem,
      ...response,
      task_id: response.task_id ?? taskId,
      file: response.file || currentItem.file,
      hint: undefined,
    })

    if (shouldAutoPoll(nextItem.status)) {
      schedulePoll(nextItem)
    } else if (isTaskTerminal(nextItem.status)) {
      stopPolling(taskId)
    }
  } catch (err) {
    if (currentItem && shouldAutoPoll(currentItem.status)) {
      setTaskHint(taskId, '自动刷新失败，将继续尝试；你也可以手动刷新。')
      schedulePoll(currentItem)
    } else {
      setTaskHint(taskId, err instanceof ApiError ? err.message : '刷新失败，请稍后重试')
    }
  } finally {
    inFlightTaskIds.delete(taskId)
    markTaskRefreshing(taskId, false)
  }
}

async function refreshSingleTask(item: UploadTaskItem) {
  const taskId = getTaskId(item)
  if (!taskId) return
  await refreshTask(taskId)
}

function mergeFiles(files: FileList | File[]) {
  const incoming = Array.from(files)
  const seen = new Set(selectedFiles.value.map(file => `${file.name}-${file.size}`))
  const deduped = incoming.filter(file => !seen.has(`${file.name}-${file.size}`))
  selectedFiles.value = [...selectedFiles.value, ...deduped]
}

function handleInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    mergeFiles(target.files)
  }
  target.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files?.length) {
    mergeFiles(event.dataTransfer.files)
  }
}

function removeFile(index: number) {
  selectedFiles.value = selectedFiles.value.filter((_, currentIndex) => currentIndex !== index)
}

async function submitUpload() {
  if (!selectedFiles.value.length || uploading.value) return

  stopAllPolling()
  uploading.value = true
  error.value = ''
  results.value = []
  batchId.value = null

  try {
    const response = await api.uploadResumes(selectedFiles.value)
    results.value = response.results.map(item => ({ ...item }))
    batchId.value = response.batch_id ?? null
    selectedFiles.value = []
    results.value.forEach(schedulePoll)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '上传失败，请稍后重试'
  } finally {
    uploading.value = false
  }
}

onBeforeUnmount(() => {
  stopAllPolling()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <section class="rounded-2xl bg-white p-6 shadow-card">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <p class="text-xs font-medium uppercase tracking-[0.2em] text-primary">Resume Upload</p>
          <h2 class="font-display text-2xl text-ink">简历上传</h2>
          <p class="max-w-2xl text-sm leading-6 text-muted">
            支持单份或多份 PDF / Word / ZIP 简历上传。文件提交后会立即进入解析，结果会展示在当前页面，方便你继续回到候选人库查看。
          </p>
        </div>
        <div class="rounded-2xl border border-primary/15 bg-surface-soft px-4 py-3 text-sm text-body">
          <p class="font-medium text-ink">MVP 上传提示</p>
          <p class="mt-1 text-muted">先选文件，再点“开始上传”。如果结果里有失败项，会直接显示原因。</p>
        </div>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
      <div class="rounded-2xl bg-white p-6 shadow-card">
        <div
          class="rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors"
          :class="hasFiles ? 'border-primary bg-primary/5' : 'border-hairline bg-surface-soft/70'"
          @dragover.prevent
          @drop="handleDrop"
        >
          <input
            ref="inputRef"
            type="file"
            class="hidden"
            :accept="acceptedTypes"
            multiple
            @change="handleInputChange"
          />
          <p class="font-display text-xl text-ink">拖拽文件到这里，或点击选择简历</p>
          <p class="mt-2 text-sm text-muted">支持 `.pdf`、`.doc`、`.docx`、`.zip`，可一次选择多份文件。</p>
          <button
            type="button"
            class="mt-5 inline-flex items-center rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            @click="inputRef?.click()"
          >
            选择文件
          </button>
        </div>

        <div class="mt-6 rounded-2xl border border-hairline bg-surface-soft/50 p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-ink">已选文件</p>
              <p class="mt-1 text-xs text-muted">
                {{ hasFiles ? `共 ${selectedFiles.length} 份，确认后会直接提交到解析接口。` : '暂未选择文件，请先添加需要上传的简历。' }}
              </p>
            </div>
            <button
              v-if="hasFiles"
              type="button"
              class="text-xs text-muted transition hover:text-danger"
              @click="selectedFiles = []"
            >
              清空
            </button>
          </div>

          <ul v-if="hasFiles" class="mt-4 space-y-3">
            <li
              v-for="(file, index) in selectedFiles"
              :key="`${file.name}-${file.size}-${index}`"
              class="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-body">{{ file.name }}</p>
                <p class="mt-1 text-xs text-muted">{{ (file.size / 1024 / 1024).toFixed(file.size > 1024 * 1024 ? 1 : 2) }} MB</p>
              </div>
              <button
                type="button"
                class="text-xs text-muted transition hover:text-danger"
                @click="removeFile(index)"
              >
                移除
              </button>
            </li>
          </ul>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button
            data-testid="upload-submit"
            type="button"
            class="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!hasFiles || uploading"
            @click="submitUpload"
          >
            {{ uploading ? '上传中…' : '开始上传' }}
          </button>
          <p class="text-xs text-muted">上传成功后，页面下方会自动刷新处理中任务，你也可以手动刷新单条结果。</p>
        </div>

        <p v-if="error" class="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {{ error }}
        </p>
      </div>

      <div class="space-y-6">
        <section class="rounded-2xl bg-white p-6 shadow-card">
          <h3 class="font-display text-lg text-ink">上传后你会看到什么</h3>
          <ul class="mt-4 space-y-3 text-sm text-muted">
            <li>1. 每个文件都会显示处理状态：成功、跳过或失败。</li>
            <li>2. 成功项会返回候选人 ID，方便你后续核对入库结果。</li>
            <li>3. 如果上传了 ZIP，系统会按解压后的简历逐份返回结果。</li>
          </ul>
        </section>

        <section class="rounded-2xl bg-white p-6 shadow-card">
          <div class="flex items-center justify-between">
            <h3 class="font-display text-lg text-ink">上传结果</h3>
            <span v-if="results.length" class="rounded-full bg-surface-soft px-3 py-1 text-xs text-muted">
              {{ results.length }} 条
            </span>
          </div>

          <div v-if="!results.length" class="mt-4 rounded-2xl border border-dashed border-hairline px-4 py-6 text-sm text-muted">
            上传完成后，这里会显示返回结果；现在还没有结果可展示。
          </div>

          <div v-else class="mt-4 space-y-4">
            <div class="rounded-2xl bg-surface-soft p-4 text-sm text-body">
              <p class="font-medium text-ink">{{ resultsHeadline }}</p>
              <p class="mt-1 text-muted">{{ summaryText }}</p>
            </div>

            <ul class="space-y-3">
              <li
                v-for="item in results"
                :key="`${item.file}-${item.status}-${item.candidate_id || item.reason || ''}`"
                class="rounded-2xl border border-hairline bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-body">{{ item.file }}</p>
                    <p v-if="item.task_id" class="mt-1 text-xs text-muted">任务 ID {{ item.task_id }}</p>
                    <p v-if="item.candidate_id" class="mt-1 text-xs text-muted">候选人 ID {{ item.candidate_id }}</p>
                    <p v-if="item.reason" class="mt-2 text-xs text-danger">{{ item.reason }}</p>
                    <p v-else-if="item.hint" class="mt-2 text-xs text-muted">{{ item.hint }}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <button
                      v-if="item.task_id"
                      type="button"
                      class="rounded-full border border-hairline px-3 py-1 text-xs text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="isTaskRefreshing(item.task_id)"
                      @click="refreshSingleTask(item)"
                    >
                      {{ isTaskRefreshing(item.task_id) ? '刷新中…' : '刷新' }}
                    </button>
                    <span
                      class="rounded-full px-3 py-1 text-xs"
                      :class="getStatusClass(item.status)"
                    >
                      {{ getStatusLabel(item.status) }}
                    </span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
