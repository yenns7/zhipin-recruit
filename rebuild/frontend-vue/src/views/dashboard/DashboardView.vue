<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-xl shadow-card p-6">
      <h2 class="font-display text-lg text-ink mb-2">欢迎回来，{{ auth.name }}</h2>
      <p class="text-sm text-muted">当前角色：{{ auth.role === 'recruiter' ? '招聘专员' : auth.role === 'manager' ? '招聘经理' : auth.role === 'admin' ? '管理员' : '面试官' }}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white rounded-xl shadow-card p-5">
        <p class="text-xs text-muted mb-1">今日待处理</p>
        <p class="font-display text-2xl text-ink">--</p>
      </div>
      <div class="bg-white rounded-xl shadow-card p-5">
        <p class="text-xs text-muted mb-1">进行中岗位</p>
        <p class="font-display text-2xl text-ink">--</p>
      </div>
      <div class="bg-white rounded-xl shadow-card p-5">
        <p class="text-xs text-muted mb-1">候选人总数</p>
        <p class="font-display text-2xl text-ink">--</p>
      </div>
    </div>
  </div>
</template>
