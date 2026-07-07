<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/http'
import type { CandidateListItem } from '@/types/api'

const items = ref<CandidateListItem[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    items.value = await api.listCandidates()
  } catch {}
  loading.value = false
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-display text-lg text-ink">候选人</h2>
        <p class="mt-1 text-sm text-muted">
          上传简历后会进入异步解析；解析完成后会真实写入本地 rebuild H2 候选人库，而不是只停留在前端临时态。
        </p>
      </div>
    </div>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else-if="items.length === 0" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
      暂无候选人数据，请先上传简历。
    </div>
    <div v-else class="bg-white rounded-xl shadow-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
            <th class="px-4 py-3 font-medium">姓名</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-b border-hairline/50 hover:bg-surface-soft">
            <td class="px-4 py-3 text-body">{{ item.name_masked }}</td>
            <td class="px-4 py-3"><span class="text-xs bg-surface-soft px-2 py-0.5 rounded-full">{{ item.parse_status }}</span></td>
            <td class="px-4 py-3 text-muted">{{ item.created_at?.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
