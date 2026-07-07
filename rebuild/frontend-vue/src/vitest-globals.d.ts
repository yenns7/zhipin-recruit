import type { Mock as VitestMock } from 'vitest'

declare global {
  namespace vi {
    type Mock = VitestMock
  }
}

export {}
