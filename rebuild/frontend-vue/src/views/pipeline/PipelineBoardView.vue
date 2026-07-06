<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/http'

const stages = ref<Record<string, any[]>>({})
const loading = ref(true)
const error = ref('')

const STAGE_LABELS: Record<string, string> = {
  pending: '待处理',
  ai_screen: 'AI 初筛',
  business_review: '业务评估',
  interview: '面试中',
  offer: 'Offer',
  onboarded: '已入职',
  rejected: '已淘汰',
}

onMounted(async () => {
  try {
    // Default to job 1 for demo — real impl would pick from a job selector
    const board = await api.getPipelineBoard(1)
    stages.value = board.stages
  } catch (e: any) {
    error.value = e.message || '加载失败'
  }
  loading.value = false
})
</script>

<template>
  <div class="space-y-4">
    <h2 class="font-display text-lg text-ink">招聘流程</h2>
    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      <div v-for="(items, stage) in stages" :key="stage" class="bg-surface-card rounded-lg p-3 min-h-[200px]">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-muted">{{ STAGE_LABELS[stage] || stage }}</span>
          <span class="text-xs text-ink font-display">{{ items.length }}</span>
        </div>
        <div v-if="items.length === 0" class="text-xs text-muted-soft text-center py-4">暂无</div>
        <div v-for="item in items" :key="item.candidate_id" class="bg-white rounded-lg p-2.5 mb-2 shadow-card text-xs">
          <p class="text-body font-medium truncate">{{ item.candidate_name }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
