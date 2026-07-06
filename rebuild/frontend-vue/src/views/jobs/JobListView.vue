<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/http'

const items = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    items.value = await api.listJobs()
  } catch {}
  loading.value = false
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-lg text-ink">岗位管理</h2>
    </div>
    <div v-if="loading" class="text-sm text-muted">加载中…</div>
    <div v-else-if="items.length === 0" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
      暂无岗位，请新建岗位。
    </div>
    <div v-else class="bg-white rounded-xl shadow-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
            <th class="px-4 py-3 font-medium">岗位名称</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-b border-hairline/50 hover:bg-surface-soft">
            <td class="px-4 py-3 text-body">{{ item.title }}</td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full" :class="item.status === 'active' ? 'bg-success/10 text-success' : 'bg-surface-strong text-muted'">
                {{ item.status === 'active' ? '招聘中' : '已关闭' }}
              </span>
            </td>
            <td class="px-4 py-3 text-muted">{{ item.created_at?.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
