import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts unauthenticated with null values', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
    expect(store.role).toBeNull()
    expect(store.name).toBeNull()
  })

  it('sets authenticated state', () => {
    const store = useAuthStore()
    store.token = 'xyz'
    store.role = 'recruiter'
    store.name = '测试'
    expect(store.isAuthenticated).toBe(true)
    expect(store.role).toBe('recruiter')
  })
})
