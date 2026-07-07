<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

interface SummaryMetric {
  key: string
  label: string
  value: number
  trend: string
  trendDirection: 'up' | 'down' | 'neutral'
}

interface BiOverviewResponse {
  summary: SummaryMetric[]
  generatedAt: string
}

const payload = ref<BiOverviewResponse | null>(null)
const loading = ref(true)
const error = ref('')

const generatedAtLabel = computed(() => {
  if (!payload.value?.generatedAt) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(payload.value.generatedAt))
})

async function loadOverview() {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('hireinsight_token')
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch('/api/v1/bi/overview', {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    throw new Error(`BI 概览加载失败 (${response.status})`)
  }

  const result = await response.json() as ApiEnvelope<BiOverviewResponse>
  payload.value = result.data
}

onMounted(async () => {
  try {
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'BI 概览加载失败'
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
          <p class="text-xs uppercase tracking-[0.18em] text-muted">BI Scope</p>
          <h2 class="mt-2 font-display text-2xl text-ink">数据看板口径说明</h2>
          <p class="mt-3 max-w-3xl text-sm text-muted">
            本页把“已经持久化到 Java rebuild PostgreSQL dev 数据库的演示状态”和“仍然只是演示口径的 BI 指标”分开说明，避免继续把当前重构版笼统写成 demo / in-memory。
          </p>
        </div>
        <div class="rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
          更新时间：{{ generatedAtLabel }}
        </div>
      </div>

      <div class="mt-4 rounded-xl border border-dashed border-hairline bg-surface-soft/50 p-4 text-sm text-body">
        当前重构版默认使用 Java rebuild PostgreSQL dev 数据库保存演示状态；但 BI 概览本身仍来自服务端 rule-based 聚合，不代表真实生产 BI、真实渠道转化或真实归因口径。
      </div>

      <ul class="mt-4 space-y-2 text-sm text-body">
        <li>系统设置参数、模型摘要、审计日志、通知待办覆盖状态、集成账号与抓取任务、demo 登录会话已落到 PostgreSQL dev 数据库或明确标注的进程内存态。</li>
        <li>当前 BI 指标仍是重构版样例数据与规则聚合结果，不等于真实业务明细汇总。</li>
        <li>环境仍为非生产，未接真实第三方渠道，未接真实配置中心，也未落真实供应商密钥。</li>
      </ul>
    </section>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-else-if="loading" class="rounded-xl bg-white p-6 text-sm text-muted shadow-card">加载中…</div>

    <section v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="metric in payload?.summary || []"
        :key="metric.key"
        class="rounded-2xl bg-white p-5 shadow-card"
      >
        <p class="text-sm text-muted">{{ metric.label }}</p>
        <p class="mt-3 font-display text-3xl text-ink">{{ metric.value }}</p>
        <p class="mt-2 text-xs text-body">{{ metric.trend }}</p>
      </article>
    </section>
  </div>
</template>
