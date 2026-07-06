<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/http'

const items = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    items.value = await api.listInterviews()
  } catch {}
  loading.value = false
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-lg text-ink">AI 面试</h2>
    </div>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else-if="items.length === 0" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
      暂无面试记录。
    </div>
    <div v-else class="bg-white rounded-xl shadow-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
            <th class="px-4 py-3 font-medium">候选人</th>
            <th class="px-4 py-3 font-medium">岗位</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">评分</th>
            <th class="px-4 py-3 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-b border-hairline/50 hover:bg-surface-soft">
            <td class="px-4 py-3 text-body">{{ item.candidate_name }}</td>
            <td class="px-4 py-3 text-muted">{{ item.job_title }}</td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full bg-surface-soft">{{ item.status }}</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="item.score !== null" class="text-sm font-medium text-ink">{{ item.score }}</span>
              <span v-else class="text-xs text-muted">--</span>
            </td>
            <td class="px-4 py-3 text-muted">{{ item.created_at?.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
