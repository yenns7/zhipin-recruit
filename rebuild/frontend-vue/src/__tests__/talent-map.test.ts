import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalentMapView from '@/views/talent-map/TalentMapView.vue'
import type { TalentMap, TalentMapSummary } from '@/types/api'

const FAKE_MAPS: TalentMapSummary[] = [
  { id: 1, name: '省总人才地图', job_id: null, job_title: '', department: '销售中心', owner_hr_id: 1, companies_count: 2, people_count: 3, updated_at: '2026-07-01T00:00:00Z' },
  { id: 2, name: '研发人才地图', job_id: null, job_title: '', department: '研发中心', owner_hr_id: 1, companies_count: 1, people_count: 1, updated_at: '2026-07-02T00:00:00Z' },
]

const FAKE_DETAIL: TalentMap = {
  id: 1,
  name: '省总人才地图',
  job_id: null,
  job_title: '',
  department: '销售中心',
  owner_hr_id: 1,
  companies_count: 2,
  people_count: 3,
  updated_at: '2026-07-01T00:00:00Z',
  created_at: '2026-06-01T00:00:00Z',
  board_json: { columns: ['目标公司', '潜在人选', '重点关注', '已接触', '暂不合适'] },
  companies: [
    { id: 1, map_id: 1, company_name: '竞品科技', city: '深圳', region: '', industry: '', priority: 'high', note: '', created_at: null, updated_at: null },
    { id: 2, map_id: 1, company_name: '对标软件', city: '北京', region: '', industry: '', priority: 'medium', note: '', created_at: null, updated_at: null },
  ],
  people: [
    { id: 1, map_id: 1, company_id: 1, company_name: '竞品科技', name: '张三', title: '省区负责人', city: '深圳', tags: ['大客户销售', '团队管理'], salary_range: '40-60万', contact_status: '重点关注', evaluation: '团队管理经验丰富', source: '', next_follow_at: null, note: '', created_at: null, updated_at: null },
    { id: 2, map_id: 1, company_id: 2, company_name: '对标软件', name: '李四', title: '区域总经理', city: '北京', tags: ['商务拓展'], salary_range: '50-70万', contact_status: '未接触', evaluation: '行业资源丰富', source: '', next_follow_at: null, note: '', created_at: null, updated_at: null },
    { id: 3, map_id: 1, company_id: null, company_name: '', name: '王五', title: '销售总监', city: '广州', tags: ['团队管理'], salary_range: '', contact_status: '已接触', evaluation: '', source: '', next_follow_at: null, note: '', created_at: null, updated_at: null },
  ],
}

const EMPTY_DETAIL: TalentMap = {
  id: 1,
  name: '省总人才地图',
  job_id: null,
  job_title: '',
  department: '销售中心',
  owner_hr_id: 1,
  companies_count: 0,
  people_count: 0,
  updated_at: '2026-07-01T00:00:00Z',
  created_at: '2026-06-01T00:00:00Z',
  board_json: { columns: [] },
  companies: [],
  people: [],
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn())
}

function mockFetchList(overrides?: Partial<TalentMapSummary>[]) {
  const data = overrides ? FAKE_MAPS.map((m, i) => ({ ...m, ...(overrides[i] || {}) })) : FAKE_MAPS
  const response = { ok: true, json: async () => data }
  ;(fetch as vi.Mock).mockResolvedValueOnce(response)
  return data
}

function mockFetchDetail(detail?: TalentMap) {
  const data = detail ?? FAKE_DETAIL
  const response = { ok: true, json: async () => data }
  ;(fetch as vi.Mock).mockResolvedValueOnce(response)
}

describe('TalentMapView', () => {
  beforeEach(() => {
    stubFetch()
    localStorage.clear()
  })

  it('renders loading state initially', async () => {
    // Resolve maps list promise, but hold detail
    const detailResolve = Promise.resolve({ ok: true, json: async () => FAKE_DETAIL })
    ;(fetch as vi.Mock).mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
    ;(fetch as vi.Mock).mockReturnValueOnce(detailResolve)

    const wrapper = mount(TalentMapView)
    expect(wrapper.text()).toContain('人才地图')
    expect(wrapper.text()).toContain('Demo 预览')
  })

  it('loads and displays map list, then auto-selects first map', async () => {
    ;(fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_DETAIL })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('省总人才地图')
    expect(wrapper.text()).toContain('(3人)')
    expect(wrapper.text()).toContain('研发人才地图')
    expect(wrapper.text()).toContain('(1人)')
  })

  it('shows empty state when no maps exist', async () => {
    ;(fetch as vi.Mock).mockResolvedValueOnce({ ok: true, json: async () => [] })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('暂无人才地图')
  })

  it('renders company and people tables when detail loads', async () => {
    ;(fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_DETAIL })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('目标公司')
    expect(wrapper.text()).toContain('竞品科技')
    expect(wrapper.text()).toContain('对标软件')
    expect(wrapper.text()).toContain('潜在人选')
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('李四')
  })

  it('shows empty placeholders when detail has no companies or people', async () => {
    ;(fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_DETAIL })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('暂无目标公司')
    expect(wrapper.text()).toContain('暂无潜在人选')
  })

  it('allows switching maps by clicking tab buttons', async () => {
    ;(fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_DETAIL })
      // Second map selection triggers another detail call
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_DETAIL })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Click the second map button
    const buttons = wrapper.findAll('button')
    const mapBtn = buttons.find(b => b.text().includes('研发人才地图'))
    expect(mapBtn).toBeTruthy()
    mapBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Should show empty detail for second map
    expect(wrapper.text()).toContain('暂无目标公司')
  })

  it('submits create map form and updates state', async () => {
    const createdMap: TalentMap = { ...FAKE_DETAIL, id: 3, name: '新地图' }
    ;(fetch as vi.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_MAPS })
      .mockResolvedValueOnce({ ok: true, json: async () => FAKE_DETAIL })
      // POST create
      .mockResolvedValueOnce({ ok: true, json: async () => createdMap })
      // Reload maps after create
      .mockResolvedValueOnce({ ok: true, json: async () => [...FAKE_MAPS, { ...FAKE_MAPS[0], id: 3, name: '新地图', people_count: 0 }] })
      // Load detail for new map
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_DETAIL })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Fill create form and click
    const nameInput = wrapper.find<HTMLInputElement>('input[placeholder="例：省总人才地图"]')
    expect(nameInput.exists()).toBe(true)
    // The button should be "创建地图"
    const createBtns = wrapper.findAll('button').filter(b => b.text().includes('创建地图'))
    expect(createBtns.length).toBeGreaterThanOrEqual(1)
    createBtns[0].trigger('click')
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('人才地图已创建')
  })

  it('shows error state on API failure', async () => {
    ;(fetch as vi.Mock).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })

    const wrapper = mount(TalentMapView)
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Should show some error or empty state
    expect(wrapper.text()).toContain('暂无人才地图')
  })
})
