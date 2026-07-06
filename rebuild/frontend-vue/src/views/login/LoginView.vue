<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  if (!email.value || !password.value) {
    error.value = '请输入邮箱和密码'
    return
  }
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch (e: any) {
    error.value = e.message || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-soft px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="font-display text-2xl text-ink mb-2">智聘</h1>
        <p class="text-sm text-muted">企业招聘管理平台 · 仅限内部员工</p>
      </div>
      <form @submit.prevent="handleLogin" class="bg-white rounded-xl shadow-card p-6 space-y-4">
        <div>
          <label class="block text-sm text-body mb-1">邮箱</label>
          <input
            v-model="email"
            type="email"
            placeholder="name@company.com"
            class="w-full h-10 px-3 rounded-lg border border-hairline text-sm text-body placeholder-muted-soft focus:outline-none focus:border-ink transition-colors"
          />
        </div>
        <div>
          <label class="block text-sm text-body mb-1">密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="········"
            class="w-full h-10 px-3 rounded-lg border border-hairline text-sm text-body placeholder-muted-soft focus:outline-none focus:border-ink transition-colors"
          />
        </div>
        <p v-if="error" class="text-xs text-danger">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full h-10 rounded-lg bg-ink text-white text-sm font-medium hover:bg-ink/80 transition-colors disabled:opacity-50"
        >
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
