<script setup lang="ts">
import type { MatchRecommendationCard } from '@/components/match/matchDemoApi'

interface PanelOption {
  id: number
  label: string
  hint: string
}

defineProps<{
  title: string
  description: string
  selectLabel: string
  options: PanelOption[]
  selectedId: number | null
  loading: boolean
  loadingLabel: string
  emptyLabel: string
  recommendations: MatchRecommendationCard[]
  generatedAt: string | null
}>()

const emit = defineEmits<{
  change: [value: number]
}>()

function handleSelect(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('change', Number(target.value))
}

function formatTime(value: string | null) {
  if (!value) return ''
  return value.replace('T', ' ').slice(0, 16)
}
</script>

<template>
  <section class="bg-white rounded-2xl shadow-card border border-hairline p-5 space-y-4">
    <div class="space-y-1">
      <h2 class="font-display text-lg text-ink">{{ title }}</h2>
      <p class="text-sm text-muted">{{ description }}</p>
    </div>

    <label class="block space-y-2">
      <span class="text-xs uppercase tracking-wide text-muted">{{ selectLabel }}</span>
      <select
        class="w-full rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-sm text-body"
        :value="selectedId ?? ''"
        @change="handleSelect"
      >
        <option v-for="option in options" :key="option.id" :value="option.id">
          {{ option.label }} · {{ option.hint }}
        </option>
      </select>
    </label>

    <div v-if="loading" class="rounded-xl bg-surface-soft px-4 py-5 text-sm text-muted">
      {{ loadingLabel }}
    </div>
    <div v-else-if="recommendations.length === 0" class="rounded-xl bg-surface-soft px-4 py-5 text-sm text-muted">
      {{ emptyLabel }}
    </div>
    <div v-else class="space-y-3">
      <article
        v-for="item in recommendations"
        :key="item.id"
        class="rounded-xl border border-hairline bg-surface-soft px-4 py-4 space-y-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-medium text-ink">{{ item.title }}</h3>
            <p class="text-sm text-muted">{{ item.subtitle }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
            {{ item.score }} 分
          </span>
        </div>

        <ul class="space-y-1 text-sm text-body">
          <li v-for="reason in item.reasons" :key="reason">• {{ reason }}</li>
        </ul>

        <div class="rounded-lg bg-white px-3 py-3 text-sm text-body">
          <span class="font-medium text-ink">下一步动作：</span>{{ item.nextAction }}
        </div>
      </article>
    </div>

    <p v-if="generatedAt" class="text-xs text-muted">
      演示推荐生成时间：{{ formatTime(generatedAt) }}
    </p>
  </section>
</template>
