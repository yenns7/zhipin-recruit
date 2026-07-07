<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, ApiError } from '@/api/http'
import GovernanceSummaryCard from '@/components/admin/GovernanceSummaryCard.vue'
import ModelConfigCard from '@/components/admin/ModelConfigCard.vue'
import AuditLogTable from '@/components/admin/AuditLogTable.vue'
import type {
  SystemAuditLogResponse,
  SystemGovernanceMutationResponse,
  SystemModelEntry,
  SystemOverviewResponse,
  SystemParameterEntry,
} from '@/types/api'

const overview = ref<SystemOverviewResponse | null>(null)
const auditLogs = ref<SystemAuditLogResponse | null>(null)
const loading = ref(true)
const error = ref('')
const actionMessage = ref('')
const actionError = ref('')
const activeAction = ref('')

const generatedAtLabel = computed(() => {
  const source = overview.value?.generatedAt || auditLogs.value?.generatedAt
  if (!source) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(source))
})

function parameterActionLabel(entry: SystemParameterEntry): string {
  return entry.value === '开启' ? '切换为关闭' : '切换为开启'
}

function modelActionLabel(entry: SystemModelEntry): string {
  return entry.status === 'active' ? '切换为 standby' : '切换为 active'
}

function isActionRunning(actionKey: string): boolean {
  return activeAction.value === actionKey
}

async function loadGovernanceData() {
  try {
    const [overviewPayload, auditPayload] = await Promise.all([
      api.getSystemOverview(),
      api.getSystemAuditLogs(),
    ])
    overview.value = overviewPayload
    auditLogs.value = auditPayload
    error.value = ''
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error.value = '仅管理员可查看系统治理 demo 页面。'
    } else {
      error.value = err instanceof Error ? err.message : '系统治理页面加载失败'
    }
  }
}

async function runMutation(
  actionKey: string,
  request: () => Promise<SystemGovernanceMutationResponse>,
) {
  actionMessage.value = ''
  actionError.value = ''
  activeAction.value = actionKey

  try {
    const mutation = await request()
    actionMessage.value = `${mutation.message}，当前值：${mutation.currentValue}。`
    await loadGovernanceData()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '系统治理写操作失败'
  } finally {
    activeAction.value = ''
  }
}

async function toggleParameter(entry: SystemParameterEntry) {
  await runMutation(`parameter:${entry.key}`, () => api.toggleSystemParameter(entry.key))
}

async function toggleModel(entry: SystemModelEntry) {
  await runMutation(`model:${entry.id}`, () => api.toggleSystemModelStatus(entry.id))
}

onMounted(async () => {
  try {
    await loadGovernanceData()
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
          <h2 class="mt-2 font-display text-2xl text-ink">系统治理</h2>
          <p class="mt-3 max-w-3xl text-sm text-muted">
            这里展示系统参数摘要、模型配置摘要和审计日志列表，全部采用 demo / in-memory 读展示，
            不写数据库，也不代表完整的审计平台。
          </p>
        </div>
        <div class="rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
          更新时间：{{ generatedAtLabel }}
        </div>
      </div>
      <div class="mt-4 rounded-xl border border-dashed border-hairline bg-surface-soft/50 p-4 text-sm text-body">
        {{ overview?.demoNotice || auditLogs?.demoNotice || '仅用于 demo / in-memory 展示，不代表真实持久化配置。' }}
      </div>
    </section>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <p v-if="actionMessage" class="text-sm text-emerald-700">{{ actionMessage }}</p>
    <p v-if="actionError" class="text-sm text-danger">{{ actionError }}</p>
    <div v-if="loading" class="rounded-xl bg-white p-6 text-sm text-muted shadow-card">加载中…</div>

    <template v-else-if="overview && auditLogs">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GovernanceSummaryCard
          label="系统参数"
          :value="overview.parameterSummary.totalCount"
          hint="当前展示 admin 可读摘要项数量"
        />
        <GovernanceSummaryCard
          label="可调参数"
          :value="overview.parameterSummary.mutableCount"
          hint="只标记 demo 口径下允许后续接线的项"
        />
        <GovernanceSummaryCard
          label="模型配置"
          :value="overview.modelSummary.totalCount"
          :hint="`发布模式：${overview.modelSummary.rolloutMode}`"
        />
        <GovernanceSummaryCard
          label="审计记录"
          :value="auditLogs.total"
          hint="仅保留最近一批演示事件"
        />
      </section>

      <section class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div class="rounded-2xl bg-white p-6 shadow-card">
          <div class="flex items-center justify-between">
            <h3 class="font-display text-lg text-ink">系统参数摘要</h3>
            <span class="text-xs text-muted">{{ overview.parameterSummary.entries.length }} 项</span>
          </div>
          <div class="mt-5 space-y-3">
            <div
              v-for="entry in overview.parameterSummary.entries"
              :key="entry.key"
              class="rounded-xl border border-hairline bg-surface-soft/40 p-4"
            >
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p class="text-sm font-medium text-body">{{ entry.label }}</p>
                  <p class="mt-1 text-xs text-muted">{{ entry.key }}</p>
                </div>
                <div class="text-right md:min-w-[13rem]">
                  <p class="font-display text-lg text-ink">{{ entry.value }}</p>
                  <p class="mt-1 text-xs text-muted">{{ entry.category }} / {{ entry.exposure }}</p>
                  <button
                    v-if="entry.mutable"
                    :data-testid="`toggle-parameter-${entry.key}`"
                    type="button"
                    class="mt-3 inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-3 py-2 text-xs font-medium text-body transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="isActionRunning(`parameter:${entry.key}`)"
                    @click="toggleParameter(entry)"
                  >
                    {{ isActionRunning(`parameter:${entry.key}`) ? '提交中…' : parameterActionLabel(entry) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-display text-lg text-ink">模型配置摘要</h3>
            <span class="text-xs text-muted">模型卡片只展示摘要，不包含密钥或真实流量策略</span>
          </div>
          <div class="grid gap-4">
            <div
              v-for="entry in overview.modelSummary.entries"
              :key="entry.id"
              class="space-y-3"
            >
              <ModelConfigCard :entry="entry" />
              <div v-if="entry.mutable" class="flex justify-end">
                <button
                  :data-testid="`toggle-model-${entry.id}`"
                  type="button"
                  class="inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-3 py-2 text-xs font-medium text-body transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="isActionRunning(`model:${entry.id}`)"
                  @click="toggleModel(entry)"
                >
                  {{ isActionRunning(`model:${entry.id}`) ? '提交中…' : modelActionLabel(entry) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 class="font-display text-lg text-ink">审计日志列表</h3>
            <p class="text-sm text-muted">保留 demo 场景下的 in-memory 事件样本，方便主线后续接真实审计源。</p>
          </div>
          <div class="text-xs text-muted">共 {{ auditLogs.total }} 条</div>
        </div>
        <AuditLogTable :items="auditLogs.items" />
      </section>
    </template>
  </div>
</template>
