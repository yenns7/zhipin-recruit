<script setup lang="ts">
import type { SystemAuditLogItem } from '@/types/api'

defineProps<{
  items: SystemAuditLogItem[]
}>()

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-hairline bg-white shadow-card">
    <table class="min-w-full divide-y divide-hairline text-sm">
      <thead class="bg-surface-soft/60 text-left text-xs uppercase tracking-[0.16em] text-muted">
        <tr>
          <th class="px-4 py-3 font-medium">时间</th>
          <th class="px-4 py-3 font-medium">动作</th>
          <th class="px-4 py-3 font-medium">对象</th>
          <th class="px-4 py-3 font-medium">结果</th>
          <th class="px-4 py-3 font-medium">说明</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-hairline">
        <tr v-for="item in items" :key="item.id" class="align-top">
          <td class="px-4 py-3 text-muted">{{ formatTime(item.happenedAt) }}</td>
          <td class="px-4 py-3">
            <p class="font-medium text-body">{{ item.action }}</p>
            <p class="mt-1 text-xs text-muted">{{ item.actorName }} / {{ item.actorRole }}</p>
          </td>
          <td class="px-4 py-3">
            <p class="text-body">{{ item.targetName }}</p>
            <p class="mt-1 text-xs text-muted">{{ item.targetType }}</p>
          </td>
          <td class="px-4 py-3">
            <span class="rounded-full bg-surface-soft px-2 py-1 text-xs text-muted">{{ item.result }}</span>
          </td>
          <td class="px-4 py-3 text-muted">{{ item.detail }}</td>
        </tr>
        <tr v-if="!items.length">
          <td colspan="5" class="px-4 py-8 text-center text-sm text-muted">暂无审计记录</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
