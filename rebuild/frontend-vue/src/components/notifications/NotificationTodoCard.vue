<script setup lang="ts">
import { computed } from 'vue'
import type { NotificationTodoItem } from '@/types/api'

const props = defineProps<{
  item: NotificationTodoItem
  busy: boolean
}>()

const emit = defineEmits<{
  complete: []
  archive: []
}>()

const priorityClass = computed(() => {
  if (props.item.priority === 'high') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (props.item.priority === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
})

const statusClass = computed(() => {
  if (props.item.status === 'pending_feedback') return 'bg-sky-50 text-sky-700'
  if (props.item.status === 'needs_attention') return 'bg-rose-50 text-rose-700'
  if (props.item.status === 'completed') return 'bg-emerald-50 text-emerald-700'
  return 'bg-slate-100 text-slate-700'
})

const isResolved = computed(() => props.item.status === 'completed' || props.item.status === 'archived')
</script>

<template>
  <article class="rounded-2xl border border-hairline bg-white p-5 shadow-card">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium" :class="priorityClass">
            {{ item.priorityLabel }}
          </span>
          <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium" :class="statusClass">
            {{ item.statusLabel }}
          </span>
        </div>
        <h3 class="mt-3 font-display text-base text-ink">{{ item.title }}</h3>
      </div>
      <span class="text-xs text-muted">{{ item.dueHint }}</span>
    </div>

    <p class="mt-3 text-sm leading-6 text-body">{{ item.message }}</p>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span class="text-xs text-muted">适用角色：{{ item.audience }}</span>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="!isResolved"
          type="button"
          data-testid="complete-todo"
          class="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="busy"
          @click="emit('complete')"
        >
          {{ busy ? '处理中…' : '完成' }}
        </button>
        <button
          v-if="!isResolved"
          type="button"
          data-testid="archive-todo"
          class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="busy"
          @click="emit('archive')"
        >
          归档
        </button>
        <router-link
          :to="item.nextActionPath"
          data-testid="todo-action"
          class="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {{ item.nextActionLabel }}
        </router-link>
      </div>
    </div>
  </article>
</template>
