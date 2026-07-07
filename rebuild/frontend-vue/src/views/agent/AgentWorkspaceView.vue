<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api/http'
import type {
  AgentConversationSummary,
  AgentMessage,
} from '@/types/api'

const conversations = ref<AgentConversationSummary[]>([])
const activeConversation = ref<AgentConversationSummary | null>(null)
const messages = ref<AgentMessage[]>([])
const draft = ref('')
const loading = ref(true)
const sending = ref(false)
const error = ref('')

const activeConversationId = computed(() => activeConversation.value?.id || '')

async function loadConversation(conversationId: string) {
  const detail = await api.getAgentConversation(conversationId)
  activeConversation.value = detail.conversation
  messages.value = detail.messages
}

async function loadConversations() {
  loading.value = true
  error.value = ''
  try {
    const list = await api.listAgentConversations()
    conversations.value = list.conversations
    if (list.conversations.length > 0) {
      await loadConversation(list.conversations[0].id)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'AI 助手加载失败'
  } finally {
    loading.value = false
  }
}

async function selectConversation(conversationId: string) {
  if (conversationId === activeConversationId.value) return
  error.value = ''
  try {
    await loadConversation(conversationId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '会话加载失败'
  }
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!content || !activeConversationId.value) return
  sending.value = true
  error.value = ''
  try {
    const result = await api.sendAgentMessage(activeConversationId.value, content)
    messages.value = [...messages.value, result.userMessage, result.assistantMessage]
    draft.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : '消息发送失败'
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  await loadConversations()
})
</script>

<template>
  <div class="grid min-h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[17rem_1fr]">
    <aside class="rounded-xl bg-white p-4 shadow-card">
      <div class="mb-4">
        <p class="text-xs text-muted">confirm-first</p>
        <h2 class="mt-1 font-display text-lg text-ink">AI 助手</h2>
        <p class="mt-2 text-xs text-muted">
          只读问答可直接回复；涉及推进、淘汰、关闭岗位、修改负责人等写操作只会生成确认卡片，并继续使用当前账号权限。
        </p>
      </div>
      <div v-if="loading" class="text-sm text-muted">加载中…</div>
      <button
        v-for="conversation in conversations"
        v-else
        :key="conversation.id"
        type="button"
        class="mb-2 w-full rounded-lg border border-hairline p-3 text-left text-sm transition hover:border-ink/20"
        :class="conversation.id === activeConversationId ? 'bg-surface-soft text-ink' : 'text-body'"
        @click="selectConversation(conversation.id)"
      >
        <span class="block font-medium">{{ conversation.title }}</span>
        <span class="mt-1 block text-xs text-muted">{{ conversation.lastMessagePreview }}</span>
      </button>
      <p v-if="!loading && conversations.length === 0" class="text-sm text-muted">
        暂无助手会话，可以先由后端 demo 种子创建一条会话。
      </p>
    </aside>

    <section class="flex min-h-0 flex-col rounded-xl bg-white shadow-card">
      <header class="border-b border-hairline p-4">
        <h3 class="font-display text-lg text-ink">{{ activeConversation?.title || '今日招聘助手' }}</h3>
        <p class="mt-1 text-sm text-muted">
          {{ activeConversation?.description || '只读问答可直接回复，写操作会先生成确认卡片。' }}
        </p>
        <p class="mt-2 text-xs text-muted">
          面试官角色当前没有 AI 助手入口；如需补充反馈，请从“面试任务”进入自己的面试记录。
        </p>
      </header>

      <p v-if="error" class="m-4 text-sm text-danger">{{ error }}</p>

      <div class="flex-1 space-y-3 overflow-auto p-4">
        <article
          v-for="message in messages"
          :key="message.id"
          class="max-w-3xl rounded-xl p-4 text-sm"
          :class="message.role === 'user' ? 'ml-auto bg-ink text-white' : 'bg-surface-soft text-body'"
        >
          <p>{{ message.content }}</p>
          <div
            v-if="message.confirmation"
            class="mt-3 rounded-lg border border-hairline bg-white p-3 text-body"
          >
            <p class="font-medium text-ink">{{ message.confirmation.title }}</p>
            <p class="mt-1 text-xs text-muted">{{ message.confirmation.summary }}</p>
            <p class="mt-2 text-xs text-danger">{{ message.confirmation.riskNote }}</p>
            <dl class="mt-3 space-y-1 text-xs">
              <div
                v-for="field in message.confirmation.fields"
                :key="field.label"
                class="flex gap-2"
              >
                <dt class="text-muted">{{ field.label }}</dt>
                <dd class="text-body">{{ field.value }}</dd>
              </div>
            </dl>
            <div class="mt-3 flex gap-2">
              <button type="button" class="rounded-lg border border-hairline px-3 py-1 text-xs">
                {{ message.confirmation.confirmLabel }}
              </button>
              <button type="button" class="rounded-lg border border-hairline px-3 py-1 text-xs text-muted">
                {{ message.confirmation.cancelLabel }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <form class="border-t border-hairline p-4" @submit.prevent="sendMessage">
        <textarea
          v-model="draft"
          class="min-h-20 w-full resize-none rounded-xl border border-hairline p-3 text-sm"
          placeholder="输入要查询或准备确认的招聘动作"
        />
        <div class="mt-3 flex justify-end">
          <button
            type="submit"
            class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            :disabled="sending || !draft.trim()"
          >
            {{ sending ? '发送中…' : '发送' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
