import { describe, expect, it } from 'vitest'
import source from '../../../../rebuild/backend-java/src/main/java/com/zhiping/rebuild/agent/AgentDemoService.java?raw'
import prd from '../../../../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-prd.md?raw'
import api from '../../../../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-api.md?raw'

describe('agent copy contract', () => {
  it('keeps agent documented as in-memory confirm-first instead of pretending it is persisted automation', () => {
    expect(source).toContain('ConcurrentHashMap')
    expect(source).toContain('confirm-first')
    expect(prd).toContain('进程内存态 + confirm-first')
    expect(api).toContain('进程内存态，不是持久化会话中心')
    expect(api).toContain('不执行真实写操作')
  })
})
