<script setup lang="ts">
import type { SystemModelEntry } from '@/types/api'

defineProps<{
  entry: SystemModelEntry
}>()
</script>

<template>
  <article class="rounded-xl border border-hairline bg-white p-5 shadow-card">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.18em] text-muted">{{ entry.provider }}</p>
        <h3 class="mt-2 font-display text-lg text-ink">{{ entry.model }}</h3>
      </div>
      <span class="rounded-full bg-surface-soft px-3 py-1 text-xs text-muted">{{ entry.status }}</span>
    </div>
    <dl class="mt-4 space-y-3 text-sm">
      <div>
        <dt class="text-xs text-muted">使用场景</dt>
        <dd class="mt-1 text-body">{{ entry.scenario }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">回退模型</dt>
        <dd class="mt-1 text-body">{{ entry.fallbackModel }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">说明</dt>
        <dd class="mt-1 text-muted">{{ entry.note }}</dd>
      </div>
    </dl>
  </article>
</template>
