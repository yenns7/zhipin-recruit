<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  hint: string
}>()
</script>

<template>
  <div class="rounded-xl bg-white p-5 shadow-card">
    <p class="text-xs text-muted">{{ label }}</p>
    <p class="mt-2 font-display text-2xl text-ink">{{ value }}</p>
    <p class="mt-3 text-xs text-muted">{{ hint }}</p>
  </div>
</template>
