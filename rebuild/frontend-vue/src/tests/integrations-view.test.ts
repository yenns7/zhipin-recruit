import { describe, expect, it } from 'vitest'
import migration from '../../../../rebuild/backend-java/src/main/resources/db/migration/V5__integration_persistence.sql?raw'
import source from '../../../../rebuild/backend-java/src/main/java/com/hireinsight/integration/service/IntegrationDemoService.java?raw'
import api from '../../../../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-api.md?raw'
import prd from '../../../../docs/superpowers/specs/2026-07-06-java-springboot-vue-rebuild-prd.md?raw'

describe('integrations copy contract', () => {
  it('describes integrations as locally persisted demo records rather than real third-party connectivity', () => {
    expect(migration).toContain('create table if not exists integration_accounts')
    expect(migration).toContain('create table if not exists integration_crawl_tasks')
    expect(source).toContain('ConcurrentHashMap')
    expect(source).toContain('integration_accounts')
    expect(source).toContain('integration_crawl_tasks')
    expect(api).toContain('非真实第三方授权')
    expect(api).toContain('写本地扩展上下文表')
    expect(prd).toContain('集成账号、扩展上下文、抓取任务')
    expect(prd).toContain('非真实第三方')
  })
})
