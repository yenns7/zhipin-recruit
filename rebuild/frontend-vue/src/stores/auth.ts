import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api/http'
import { getToken, setToken, clearToken, setUnauthorizedHandler } from '@/api/http'
import type { Role } from '@/types'
import type { UserPasswordChangeResponse } from '@/types/api'

const NAME_KEY = 'hireinsight_name'
const ROLE_KEY = 'hireinsight_role'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const role = ref<Role | null>(localStorage.getItem(ROLE_KEY) as Role | null)
  const name = ref<string | null>(localStorage.getItem(NAME_KEY))

  const isAuthenticated = computed(() => !!token.value)

  async function login(email: string, password: string) {
    const res = await api.login({ email, password })
    token.value = res.token
    role.value = res.role as Role
    name.value = res.name
    setToken(res.token)
    localStorage.setItem(NAME_KEY, res.name)
    localStorage.setItem(ROLE_KEY, res.role)
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<UserPasswordChangeResponse> {
    return api.changePassword({ currentPassword, newPassword })
  }

  function clearSession() {
    token.value = null
    role.value = null
    name.value = null
    clearToken()
    localStorage.removeItem(NAME_KEY)
    localStorage.removeItem(ROLE_KEY)
  }

  async function logout() {
    try {
      if (token.value) {
        await api.logout()
      }
    } finally {
      clearSession()
    }
  }

  setUnauthorizedHandler(clearSession)

  return { token, role, name, isAuthenticated, login, logout, changePassword }
})
