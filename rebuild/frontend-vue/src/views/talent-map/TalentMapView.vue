<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getToken } from '@/api/http'
import type { TalentMap, TalentMapSummary, TalentMapCompany, TalentMapPerson } from '@/types/api'

// ---- Types ----

type ContactStatus = '未接触' | '重点关注' | '已接触' | '暂不合适'
const CONTACT_STATUSES: ContactStatus[] = ['未接触', '重点关注', '已接触', '暂不合适']
const PRIORITY_OPTIONS = ['high', 'medium', 'low'] as const

// ---- State ----

const maps = ref<TalentMapSummary[]>([])
const activeMap = ref<TalentMap | null>(null)
const loadingMaps = ref(true)
const loadingDetail = ref(false)
const activeMapId = ref<number | null>(null)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

// Filters
const companyFilter = ref('')
const cityFilter = ref('')
const statusFilter = ref('')
const keywordFilter = ref('')

// Create map form
const mapName = ref('省总人才地图')
const mapJobId = ref('')
const mapDepartment = ref('')
const creatingMap = ref(false)

// Add company form
const companyName = ref('')
const companyCity = ref('')
const companyPriority = ref('high')
const addingCompany = ref(false)

// Add person form
const personName = ref('')
const personTitle = ref('')
const personCompanyId = ref('')
const personCity = ref('')
const personTags = ref('')
const personStatus = ref<ContactStatus>('未接触')
const personEvaluation = ref('')
const personSalary = ref('')
const addingPerson = ref(false)

// ---- Helpers ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapPayload<T>(payload: unknown): T | null {
  if (isRecord(payload) && 'data' in payload) {
    return payload.data as T
  }
  return payload as T | null
}

function tagsFromText(value: string): string[] {
  return value
    .split(/[，,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function formatPriorityLabel(priority: string): string {
  switch (priority) {
    case 'high': return '高优先级'
    case 'medium': return '中优先级'
    case 'low': return '低优先级'
    default: return priority
  }
}

function formatPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'bg-danger/10 text-danger'
    case 'medium': return 'bg-amber-100 text-amber-700'
    case 'low': return 'bg-surface-strong text-muted'
    default: return 'bg-surface-strong text-muted'
  }
}

function formatContactStatusColor(status: string): string {
  switch (status) {
    case '未接触': return 'bg-surface-strong text-muted'
    case '重点关注': return 'bg-amber-100 text-amber-700'
    case '已接触': return 'bg-blue-100 text-blue-700'
    case '暂不合适': return 'bg-danger/10 text-danger'
    default: return 'bg-surface-strong text-muted'
  }
}

// ---- Data Loading ----

async function loadMaps() {
  loadingMaps.value = true
  error.value = null

  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch('/api/v1/talent-maps', { headers })
    if (!res.ok) throw new Error('加载地图列表失败')
    const payload = await res.json()
    const data = unwrapPayload<TalentMapSummary[]>(payload) ?? (Array.isArray(payload) ? payload : [])
    maps.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    maps.value = []
    error.value = e.message || '加载失败'
  } finally {
    loadingMaps.value = false
  }
}

async function loadDetail() {
  if (activeMapId.value === null) {
    activeMap.value = null
    return
  }

  loadingDetail.value = true
  error.value = null

  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const search = new URLSearchParams()
  if (companyFilter.value) search.set('company', companyFilter.value)
  if (cityFilter.value) search.set('city', cityFilter.value)
  if (statusFilter.value) search.set('status', statusFilter.value)
  if (keywordFilter.value) search.set('keyword', keywordFilter.value)
  const suffix = search.toString() ? `?${search.toString()}` : ''

  try {
    const res = await fetch(`/api/v1/talent-maps/${activeMapId.value}${suffix}`, { headers })
    if (!res.ok) throw new Error('加载地图详情失败')
    const payload = await res.json()
    const data = unwrapPayload<TalentMap>(payload) ?? (isRecord(payload) ? payload as unknown as TalentMap : null)
    activeMap.value = data
  } catch (e: any) {
    activeMap.value = null
    error.value = e.message || '加载详情失败'
  } finally {
    loadingDetail.value = false
  }
}

function selectMap(id: number) {
  activeMapId.value = id
  message.value = null
  loadDetail()
}

// ---- Mutations ----

async function handleCreateMap() {
  if (!mapName.value.trim()) return
  creatingMap.value = true
  message.value = null
  error.value = null

  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch('/api/v1/talent-maps', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: mapName.value.trim(),
        job_id: mapJobId.value ? Number(mapJobId.value) : null,
        department: mapDepartment.value.trim(),
        board_json: { columns: ['目标公司', '潜在人选', '重点关注', '已接触', '暂不合适'] },
      }),
    })
    if (!res.ok) throw new Error('创建地图失败')
    const payload = await res.json()
    const created = unwrapPayload<TalentMap>(payload) ?? (isRecord(payload) ? payload as unknown as TalentMap : null)
    if (created) {
      activeMapId.value = created.id
      mapName.value = '省总人才地图'
      mapJobId.value = ''
      mapDepartment.value = ''
      message.value = '人才地图已创建'
      await loadMaps()
      await loadDetail()
    }
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    creatingMap.value = false
  }
}

async function handleAddCompany() {
  if (!activeMap.value || !companyName.value.trim()) return
  addingCompany.value = true
  message.value = null
  error.value = null

  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(`/api/v1/talent-maps/${activeMap.value.id}/companies`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        company_name: companyName.value.trim(),
        city: companyCity.value.trim(),
        priority: companyPriority.value,
      }),
    })
    if (!res.ok) throw new Error('保存公司失败')
    companyName.value = ''
    companyCity.value = ''
    companyPriority.value = 'high'
    message.value = '目标公司已保存'
    await loadMaps()
    await loadDetail()
  } catch (e: any) {
    error.value = e.message || '保存失败'
  } finally {
    addingCompany.value = false
  }
}

async function handleAddPerson() {
  if (!activeMap.value || !personName.value.trim()) return
  addingPerson.value = true
  message.value = null
  error.value = null

  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(`/api/v1/talent-maps/${activeMap.value.id}/people`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        company_id: personCompanyId.value ? Number(personCompanyId.value) : null,
        name: personName.value.trim(),
        title: personTitle.value.trim(),
        city: personCity.value.trim(),
        tags: tagsFromText(personTags.value),
        contact_status: personStatus.value,
        evaluation: personEvaluation.value.trim(),
        salary_range: personSalary.value.trim(),
      }),
    })
    if (!res.ok) throw new Error('保存人选失败')
    personName.value = ''
    personTitle.value = ''
    personCompanyId.value = ''
    personCity.value = ''
    personTags.value = ''
    personStatus.value = '未接触'
    personEvaluation.value = ''
    personSalary.value = ''
    message.value = '潜在人选已保存'
    await loadMaps()
    await loadDetail()
  } catch (e: any) {
    error.value = e.message || '保存失败'
  } finally {
    addingPerson.value = false
  }
}

function clearFilters() {
  companyFilter.value = ''
  cityFilter.value = ''
  statusFilter.value = ''
  keywordFilter.value = ''
  loadDetail()
}

function dismissMessage() {
  message.value = null
}

// ---- Lifecycle ----

onMounted(async () => {
  await loadMaps()
  if (maps.value.length > 0) {
    selectMap(maps.value[0].id)
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="font-display text-lg text-ink">人才地图</h2>
      <div class="flex items-center gap-2 text-xs text-muted">
        <span>Demo 预览 · 数据仅用于演示</span>
      </div>
    </div>

    <!-- Flash message -->
    <div
      v-if="message"
      class="flex items-center justify-between rounded-lg bg-success/10 px-4 py-2 text-sm text-success"
    >
      <span>{{ message }}</span>
      <button class="text-success/70 hover:text-success" type="button" @click="dismissMessage">&times;</button>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">
      {{ error }}
    </div>

    <!-- Map selector -->
    <div v-if="!loadingMaps && maps.length > 0" class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">选择地图：</span>
      <button
        v-for="m in maps"
        :key="m.id"
        class="rounded-lg border px-3 py-1.5 text-xs font-medium transition"
        :class="m.id === activeMapId ? 'border-ink bg-ink text-white' : 'border-hairline bg-white text-body hover:border-ink/30'"
        type="button"
        @click="selectMap(m.id)"
      >
        {{ m.name }}
        <span class="ml-1 text-[10px] opacity-70">({{ m.people_count }}人)</span>
      </button>
    </div>

    <!-- Main grid: detail + side forms -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <!-- Detail area (2/3) -->
      <div class="space-y-4 lg:col-span-2">
        <!-- Loading state -->
        <div v-if="loadingDetail" class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted">
          加载中…
        </div>

        <!-- Empty state: no map selected -->
        <div
          v-else-if="!activeMap && !loadingMaps && maps.length === 0"
          class="bg-white rounded-xl shadow-card p-8 text-center text-sm text-muted"
        >
          <p>暂无人才地图。</p>
          <p class="mt-2 text-xs text-muted">
            你可以创建一个新地图来追踪目标公司和潜在人选。Demo 期间数据仅用于演示，不会影响正式环境。
          </p>
        </div>

        <!-- Detail: companies -->
        <div
          v-if="activeMap"
          class="bg-white rounded-xl shadow-card overflow-hidden"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <h3 class="text-sm font-medium text-ink">目标公司 ({{ activeMap?.companies?.length ?? 0 }})</h3>
          </div>
          <div v-if="(activeMap?.companies?.length ?? 0) === 0" class="p-6 text-center text-xs text-muted">
            暂无目标公司。请在右侧表单添加。
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
                <th class="px-4 py-3 font-medium">公司名称</th>
                <th class="px-4 py-3 font-medium">城市</th>
                <th class="px-4 py-3 font-medium">优先级</th>
                <th class="px-4 py-3 font-medium">备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in activeMap?.companies ?? []" :key="c.id" class="border-b border-hairline/50 hover:bg-surface-soft">
                <td class="px-4 py-3 text-body">{{ c.company_name }}</td>
                <td class="px-4 py-3 text-muted">{{ c.city || '-' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-block rounded-full px-2 py-0.5 text-[11px]"
                    :class="formatPriorityColor(c.priority)"
                  >
                    {{ formatPriorityLabel(c.priority) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-muted text-xs">{{ c.note || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Detail: people -->
        <div
          v-if="activeMap"
          class="bg-white rounded-xl shadow-card overflow-hidden"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <h3 class="text-sm font-medium text-ink">潜在人选 ({{ activeMap?.people?.length ?? 0 }})</h3>
            <!-- Filters -->
            <div class="flex items-center gap-2 flex-wrap">
              <input
                v-model="companyFilter"
                class="rounded-lg border border-hairline bg-white px-2 py-1 text-xs w-24"
                placeholder="公司"
                @input="loadDetail"
              />
              <input
                v-model="cityFilter"
                class="rounded-lg border border-hairline bg-white px-2 py-1 text-xs w-20"
                placeholder="城市"
                @input="loadDetail"
              />
              <select
                v-model="statusFilter"
                class="rounded-lg border border-hairline bg-white px-2 py-1 text-xs"
                @change="loadDetail"
              >
                <option value="">全部状态</option>
                <option v-for="s in CONTACT_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
              <input
                v-model="keywordFilter"
                class="rounded-lg border border-hairline bg-white px-2 py-1 text-xs w-28"
                placeholder="关键词"
                @input="loadDetail"
              />
              <button
                class="rounded-lg border border-hairline bg-white px-2 py-1 text-xs text-muted transition hover:border-ink/30 hover:text-ink"
                type="button"
                @click="clearFilters"
              >
                重置
              </button>
            </div>
          </div>
          <div v-if="(activeMap?.people?.length ?? 0) === 0" class="p-6 text-center text-xs text-muted">
            暂无潜在人选。请在右侧表单添加。
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-hairline text-left text-muted text-xs uppercase">
                <th class="px-4 py-3 font-medium">姓名/代号</th>
                <th class="px-4 py-3 font-medium">公司</th>
                <th class="px-4 py-3 font-medium">岗位</th>
                <th class="px-4 py-3 font-medium">城市</th>
                <th class="px-4 py-3 font-medium">标签</th>
                <th class="px-4 py-3 font-medium">状态</th>
                <th class="px-4 py-3 font-medium">综合评价</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in activeMap?.people ?? []" :key="p.id" class="border-b border-hairline/50 hover:bg-surface-soft">
                <td class="px-4 py-3 font-medium text-ink">{{ p.name }}</td>
                <td class="px-4 py-3 text-body">{{ p.company_name || '未关联' }}</td>
                <td class="px-4 py-3 text-body">{{ p.title || '-' }}</td>
                <td class="px-4 py-3 text-muted">{{ p.city || '-' }}</td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="tag in p.tags.slice(0, 3)"
                      :key="tag"
                      class="inline-block rounded-full bg-surface-soft px-2 py-0.5 text-[10px] text-muted"
                    >{{ tag }}</span>
                    <span v-if="p.tags.length > 3" class="text-[10px] text-muted-soft">+{{ p.tags.length - 3 }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-block rounded-full px-2 py-0.5 text-[11px]"
                    :class="formatContactStatusColor(p.contact_status)"
                  >{{ p.contact_status }}</span>
                </td>
                <td class="px-4 py-3 text-muted text-xs max-w-[200px] truncate">{{ p.evaluation || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Side forms (1/3) -->
      <div class="space-y-4">
        <!-- Create map -->
        <div class="bg-white rounded-xl shadow-card p-4">
          <h3 class="mb-3 text-sm font-medium text-ink">新建人才地图</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-muted">地图名称</label>
              <input
                v-model="mapName"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                placeholder="例：省总人才地图"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">关联岗位</label>
              <select
                v-model="mapJobId"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="">暂不关联岗位</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">所属部门</label>
              <input
                v-model="mapDepartment"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                placeholder="例：销售中心"
              />
            </div>
            <button
              class="w-full rounded-lg bg-ink py-2 text-xs font-medium text-white transition hover:opacity-80 disabled:opacity-50"
              type="button"
              :disabled="creatingMap || !mapName.trim()"
              @click="handleCreateMap"
            >
              {{ creatingMap ? '创建中…' : '创建地图' }}
            </button>
          </div>
        </div>

        <!-- Add company -->
        <div class="bg-white rounded-xl shadow-card p-4">
          <h3 class="mb-3 text-sm font-medium text-ink">新增目标公司</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-muted">公司名称</label>
              <input
                v-model="companyName"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                placeholder="例：竞品科技"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">城市</label>
              <input
                v-model="companyCity"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                placeholder="例：深圳"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">优先级</label>
              <select
                v-model="companyPriority"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
            </div>
            <button
              class="w-full rounded-lg border border-hairline py-2 text-xs font-medium text-body transition hover:bg-surface-soft disabled:opacity-50"
              type="button"
              :disabled="addingCompany || !activeMap || !companyName.trim()"
              @click="handleAddCompany"
            >
              {{ addingCompany ? '保存中…' : '保存公司' }}
            </button>
            <p v-if="!activeMap" class="text-xs text-muted-soft text-center">请先选择或创建一个地图</p>
          </div>
        </div>

        <!-- Add person -->
        <div class="bg-white rounded-xl shadow-card p-4">
          <h3 class="mb-3 text-sm font-medium text-ink">新增潜在人选</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-muted">姓名或代号</label>
              <input
                v-model="personName"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                placeholder="例：张三"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">目标公司</label>
              <select
                v-model="personCompanyId"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="">暂不关联公司</option>
                <option v-for="c in activeMap?.companies ?? []" :key="c.id" :value="c.id">
                  {{ c.company_name }}
                </option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1 block text-xs text-muted">当前职位</label>
                <input
                  v-model="personTitle"
                  class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                  placeholder="省区负责人"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs text-muted">城市</label>
                <input
                  v-model="personCity"
                  class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                  placeholder="深圳"
                />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">能力标签（逗号分隔）</label>
              <input
                v-model="personTags"
                class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                placeholder="大客户销售, 团队管理"
              />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1 block text-xs text-muted">接触状态</label>
                <select
                  v-model="personStatus"
                  class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink"
                >
                  <option v-for="s in CONTACT_STATUSES" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-muted">薪酬区间</label>
                <input
                  v-model="personSalary"
                  class="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                  placeholder="40-60万"
                />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted">综合评价</label>
              <textarea
                v-model="personEvaluation"
                class="w-full resize-y rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
                rows="3"
                placeholder="销售团队管理经验强，建议优先接触"
              />
            </div>
            <button
              class="w-full rounded-lg border border-hairline py-2 text-xs font-medium text-body transition hover:bg-surface-soft disabled:opacity-50"
              type="button"
              :disabled="addingPerson || !activeMap || !personName.trim()"
              @click="handleAddPerson"
            >
              {{ addingPerson ? '保存中…' : '保存人选' }}
            </button>
            <p v-if="!activeMap" class="text-xs text-muted-soft text-center">请先选择或创建一个地图</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
