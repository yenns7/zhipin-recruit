// 候选人档案页（HR 视角）— 展示候选人判断卡片、核心技能证据和简历结构化内容。

import { useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertTriangle, Download, Edit3, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { candidatesApi as api } from '../api';
import { formatDate } from '../../../lib/formatDate';
import { useAsync } from '../../../lib/useAsync';
import { useAuth } from '../../../lib/auth';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner, ErrorState, Input, useToast } from '../../../components/ui';
import { Reveal } from '../../../components/motion';
import { PipelineProgress } from '../../../components/candidate/PipelineProgress';
import { ReassignOwner } from '../../../components/candidate/ReassignOwner';
import type { CandidateSourceInfo, CandidateTag, ResumeJson } from '../types';

// Cal.com 近黑配色 hex（recharts 不接受 tailwind 类）
const RADAR_STROKE = '#111111';
const RADAR_FILL = 'rgba(17, 17, 17, 0.08)';
const RADAR_GRID_STROKE = '#e5e7eb';   // hairline
const RADAR_TICK_FILL = '#6b7280';     // muted
const CORE_SKILL_LIMIT = 8;
const JUDGEMENT_SKILL_LIMIT = 6;

function sortSkillTags(tags: CandidateTag[]): CandidateTag[] {
  return [...tags]
    .filter((tag) => tag.tag)
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.tag.localeCompare(b.tag, 'zh-CN');
    });
}

function getCoreSkillTags(tags: CandidateTag[]): CandidateTag[] {
  return sortSkillTags(tags).slice(0, CORE_SKILL_LIMIT);
}

function skillTone(score: number) {
  if (score >= 4) return 'accent';
  if (score >= 3) return 'warning';
  return 'neutral';
}

// 核心技能雷达图（最多 8 个标签，避免详情页变成标签墙）
function TagRadarChart({ tags }: { tags: CandidateTag[] }) {
  const data = tags.map((t) => ({ subject: t.tag, value: t.score }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke={RADAR_GRID_STROKE} />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 12, fill: RADAR_TICK_FILL }}
        />
        <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
        <Radar
          name="技能评分"
          dataKey="value"
          stroke={RADAR_STROKE}
          fill={RADAR_FILL}
          fillOpacity={1}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function AllSkillTagsDisclosure({ tags, hiddenCount }: { tags: CandidateTag[]; hiddenCount: number }) {
  if (hiddenCount <= 0) return null;
  const sortedTags = sortSkillTags(tags);

  return (
    <details className="mt-4 rounded-md border border-hairline bg-surface-soft px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        查看全部技能标签（共 {tags.length} 个，另有 {hiddenCount} 个未放入雷达）
      </summary>
      <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-auto pr-1">
        {sortedTags.map((tag, index) => (
          <Badge key={`${tag.tag}-${tag.score}-${index}`} tone={skillTone(tag.score)}>
            {tag.tag} · {tag.score}
          </Badge>
        ))}
      </div>
    </details>
  );
}

function textFromValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function structuredSummary(value: unknown, keys: string[]): string {
  const record = Array.isArray(value)
    ? value.find(isObject)
    : isObject(value)
      ? value
      : null;
  if (record) {
    return keys
      .map((key) => textFromValue(record[key]))
      .filter(Boolean)
      .join(' · ');
  }
  if (Array.isArray(value)) {
    return value.map(textFromValue).find(Boolean) ?? '';
  }
  return textFromValue(value);
}

function uniqueLines(lines: string[], limit: number): string[] {
  return Array.from(new Set(lines.filter(Boolean))).slice(0, limit);
}

function CandidateJudgementCard({
  resumeJson,
  source,
  tags,
  coreTags,
  hiddenSkillCount,
}: {
  resumeJson: ResumeJson;
  source: CandidateSourceInfo | null | undefined;
  tags: CandidateTag[];
  coreTags: CandidateTag[];
  hiddenSkillCount: number;
}) {
  const info = getExtractedInfo(resumeJson);
  const visibleSkills = coreTags.slice(0, JUDGEMENT_SKILL_LIMIT);
  const highSkills = visibleSkills.filter((skill) => Number(skill.score || 0) >= 4);
  const latestExperience = structuredSummary(info.experience ?? info.work_experience, ['position', 'company', 'duration']);
  const education = structuredSummary(info.education, ['school', 'degree', 'major']);
  const summary = textFromValue(info.summary);

  const recommendation =
    visibleSkills.length === 0
      ? { label: '资料待补全', tone: 'neutral' as const, note: '缺少可判断的核心技能，建议先补齐简历信息。' }
      : highSkills.length >= 3 && latestExperience
        ? { label: '建议优先初筛', tone: 'success' as const, note: '核心技能和经历线索较集中，适合进入人工初筛。' }
        : highSkills.length >= 1
          ? { label: '建议人工复核', tone: 'warning' as const, note: '已有部分有效信号，但还需要结合目标岗位确认。' }
          : { label: '先补关键经历', tone: 'neutral' as const, note: '技能强度不突出，建议先确认项目和岗位相关经历。' };

  const highlights = uniqueLines([
    highSkills.length > 0 ? `高分技能：${highSkills.slice(0, 3).map((skill) => skill.tag).join('、')}` : '',
    latestExperience ? `最近经历：${latestExperience}` : '',
    education ? `教育背景：${education}` : '',
    source?.target_job_title ? `来源岗位：${source.target_job_title}` : '',
    summary ? `摘要：${summary}` : '',
  ], 3);

  const risks = uniqueLines([
    hiddenSkillCount > 12 ? 'AI 抽取标签较多，建议按目标岗位二次筛选。' : '',
    highSkills.length === 0 && visibleSkills.length > 0 ? '缺少 4 分以上核心技能，需要人工确认真实强项。' : '',
    !latestExperience ? '最近工作经历不清晰，建议补充或查看原简历。' : '',
    !source?.target_job_title ? '暂未绑定目标岗位，当前判断只能作为通用画像参考。' : '',
  ], 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>候选人判断</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="rounded-md border border-hairline bg-surface-soft px-3 py-3">
          <p className="text-xs font-medium text-muted">推荐判断</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={recommendation.tone}>{recommendation.label}</Badge>
            <span className="text-xs text-muted-soft">基于核心技能和简历结构化信息</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-body">{recommendation.note}</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">核心亮点</p>
          {highlights.length > 0 ? (
            <ul className="space-y-1.5 text-sm leading-6 text-body">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-soft">暂无足够亮点，建议先补充简历信息。</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">核心技能</p>
          {visibleSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleSkills.map((skill) => (
                <Badge key={`${skill.tag}-${skill.score}`} tone={skillTone(skill.score)}>
                  {skill.tag} · {skill.score}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-soft">暂无技能标签</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">待确认风险</p>
          {risks.length > 0 ? (
            <ul className="space-y-1.5 text-sm leading-6 text-body">
              {risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-soft">暂无明显风险，建议结合目标岗位复核。</p>
          )}
        </div>

        {coreTags.length >= 3 && (
          <details className="rounded-md border border-hairline bg-canvas px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-ink">辅助雷达</summary>
            <div className="mt-3">
              <TagRadarChart tags={coreTags} />
            </div>
          </details>
        )}

        <AllSkillTagsDisclosure tags={tags} hiddenCount={hiddenSkillCount} />
      </CardBody>
    </Card>
  );
}

// ---- 简历 JSON 渲染器 ----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => typeof i === 'string');
}

// 字符串列表，渲染为项目符号
function StringList({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-sm text-body">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// 对象数组（如工作经历条目）
function ObjectList({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <EntryCard key={i} data={item} />
      ))}
    </div>
  );
}

// 简历子字段中文标签（教育/工作经历条目内部）。键统一用小写匹配，做到大小写不敏感。
const FIELD_LABELS: Record<string, string> = {
  school: '学校',
  degree: '学位',
  major: '专业',
  year: '年份',
  years: '年限',
  duration: '时间',
  period: '时间',
  company: '公司',
  employer: '公司',
  position: '职位',
  title: '职位',
  role: '职位',
  description: '描述',
  responsibilities: '职责',
  achievements: '成果',
  name: '名称',
  date: '日期',
  start: '开始',
  end: '结束',
  level: '水平',
  proficiency: '熟练度',
  location: '地点',
  city: '城市',
  gpa: 'GPA',
  certification: '证书',
  issuer: '颁发机构',
  language: '语言',
};

// 大小写不敏感取中文标签；未知字段做基础美化（首字母大写、下划线转空格）而非裸键。
function fieldLabel(key: string): string {
  const hit = FIELD_LABELS[key.toLowerCase()];
  if (hit) return hit;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


// 标题候选键（用作条目主标题）与副标题候选键
const TITLE_KEYS = ['company', 'school', 'position', 'title', 'name'];
const SUBTITLE_KEYS = ['position', 'degree', 'major', 'title'];
const PERIOD_KEYS = ['duration', 'year', 'date'];
const DESC_KEYS = ['description', 'summary'];

// 结构化条目卡片：主标题 + 时间徽章 + 副标题 + 描述 + 其余字段。
// 取代原先把 school/degree/... 平铺成 "key: value" 的丑陋样式。
function EntryCard({ data }: { data: Record<string, unknown> }) {
  const str = (k: string) => {
    const v = data[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const pick = (keys: string[]) => keys.map(str).find(Boolean);

  const title = pick(TITLE_KEYS);
  // 副标题：学位+专业 / 职位 等组合，避免 major 等字段被丢弃。
  const subParts = SUBTITLE_KEYS
    .filter((k) => str(k) && str(k) !== title)
    .map(str);
  const subtitle = Array.from(new Set(subParts)).join(' · ') || undefined;
  const period = pick(PERIOD_KEYS);
  const desc = pick(DESC_KEYS);

  const usedKeys = new Set([
    ...TITLE_KEYS, ...SUBTITLE_KEYS, ...PERIOD_KEYS, ...DESC_KEYS,
  ]);
  // 剩余未被主结构消费的字段，作为补充键值
  const rest = Object.entries(data).filter(
    ([k, v]) => !usedKeys.has(k) && v != null && String(v).trim() !== ''
  );

  return (
    <div className="relative rounded-lg border border-hairline bg-canvas px-4 py-3.5 transition-colors hover:border-surface-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className="font-medium text-ink">{title}</p>
          ) : (
            <p className="text-sm text-muted-soft">条目</p>
          )}
          {subtitle && <p className="mt-0.5 text-sm text-body">{subtitle}</p>}
        </div>
        {period && (
          <span className="shrink-0 rounded-full bg-surface-card px-2.5 py-0.5 text-xs font-medium text-muted tabular-nums">
            {period}
          </span>
        )}
      </div>
      {desc && (
        <p className="mt-2 text-sm leading-relaxed text-body whitespace-pre-wrap">{desc}</p>
      )}
      {rest.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {rest.map(([k, v]) => (
            <div key={k} className="flex gap-1.5 text-xs">
              <dt className="shrink-0 text-muted-soft">{fieldLabel(k)}</dt>
              <dd className="text-body">{renderScalar(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// 扁平键值对渲染（用于无法结构化的对象）
function SimpleKV({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="space-y-1.5">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex gap-2 text-sm">
          <dt className="shrink-0 font-medium text-muted">{fieldLabel(k)}</dt>
          <dd className="text-ink">{renderScalar(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderScalar(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v || '—';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((i) => renderScalar(i, depth)).join(', ');
  if (isObject(v)) {
    // 最多递归 2 层，避免循环引用
    if (depth < 2) {
      return Object.entries(v)
        .map(([k, val]) => `${k}: ${renderScalar(val, depth + 1)}`)
        .join(' | ');
    }
    return JSON.stringify(v);
  }
  return String(v);
}

// 常见简历字段中文标签映射
const SECTION_LABELS: Record<string, string> = {
  education: '教育背景',
  experience: '工作经历',
  work_experience: '工作经历',
  skills: '技能',
  summary: '个人简介',
  projects: '项目经历',
  project_experience: '项目经历',
  certifications: '资质证书',
  languages: '语言能力',
  contact: '联系方式',
  name: '姓名',
  email: '邮箱',
  phone: '电话',
  intent_city: '意向城市',
  additional_info: '其他备注',
};

// 优先展示顺序
const SECTION_ORDER = [
  'summary',
  'name',
  'email',
  'phone',
  'intent_city',
  'contact',
  'education',
  'experience',
  'work_experience',
  'skills',
  'projects',
  'project_experience',
  'additional_info',
  'certifications',
  'languages',
];

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}

function sortedEntries(obj: ResumeJson): [string, unknown][] {
  const entries = Object.entries(obj);
  return entries.sort(([a], [b]) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function ResumeSection({ sectionKey, value }: { sectionKey: string; value: unknown }) {
  const label = sectionLabel(sectionKey);

  let content: ReactNode;

  if (value === null || value === undefined || value === '') {
    content = <p className="text-sm text-muted-soft">—</p>;
  } else if (typeof value === 'string') {
    content = <p className="text-sm text-body whitespace-pre-wrap">{value}</p>;
  } else if (isStringArray(value)) {
    content = <StringList items={value} />;
  } else if (Array.isArray(value)) {
    const objItems = value.filter(isObject);
    if (objItems.length > 0) {
      content = <ObjectList items={objItems} />;
    } else {
      content = <StringList items={value.map(renderScalar)} />;
    }
  } else if (isObject(value)) {
    content = <SimpleKV data={value} />;
  } else {
    content = <p className="text-sm text-body">{renderScalar(value)}</p>;
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </h3>
      {content}
    </div>
  );
}

function ResumeJsonView({ resumeJson }: { resumeJson: ResumeJson }) {
  // 后端 resume_json 结构为 { extracted_info: {...简历字段}, skills: [...], upload_date }。
  // 真正可读的简历内容在 extracted_info 里；skills 已由左栏技能标签单独展示，
  // upload_date 是元数据。故优先解包 extracted_info 渲染；兼容旧的扁平结构。
  const ei = resumeJson?.extracted_info;
  const source: ResumeJson =
    ei && typeof ei === 'object' && !Array.isArray(ei)
      ? (ei as ResumeJson)
      : resumeJson;

  const entries = sortedEntries(source).filter(
    ([k]) => k !== 'skills' && k !== 'upload_date' && k !== 'extracted_info'
  );
  if (entries.length === 0) {
    return <p className="text-sm text-muted-soft">暂无简历结构化内容</p>;
  }
  return (
    <Reveal className="space-y-6" stagger={0.07}>
      {entries.map(([k, v]) => (
        <ResumeSection key={k} sectionKey={k} value={v} />
      ))}
    </Reveal>
  );
}

interface ProfileDraft {
  name: string;
  email: string;
  phone: string;
  intentCity: string;
  summary: string;
  experienceItems: ExperienceDraftItem[];
  projectItems: ProjectDraftItem[];
  additionalInfo: string;
  skillsText: string;
}

interface ExperienceDraftItem {
  id: string;
  company: string;
  position: string;
  duration: string;
  description: string;
}

interface ProjectDraftItem {
  id: string;
  name: string;
  role: string;
  duration: string;
  description: string;
}

type StructuredDraftItem = ExperienceDraftItem | ProjectDraftItem;
type StructuredDraftField<Item extends StructuredDraftItem> = {
  key: Exclude<keyof Item, 'id'>;
  label: string;
  placeholder: string;
  multiline?: boolean;
  className?: string;
};

let structuredItemSeed = 0;

function nextStructuredItemId(prefix: string): string {
  structuredItemSeed += 1;
  return `${prefix}-${structuredItemSeed}`;
}

function getExtractedInfo(resumeJson: ResumeJson): Record<string, unknown> {
  const info = resumeJson?.extracted_info;
  return isObject(info) ? info : {};
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function createExperienceDraftItem(seed?: Partial<Omit<ExperienceDraftItem, 'id'>>): ExperienceDraftItem {
  return {
    id: nextStructuredItemId('experience'),
    company: seed?.company ?? '',
    position: seed?.position ?? '',
    duration: seed?.duration ?? '',
    description: seed?.description ?? '',
  };
}

function createProjectDraftItem(seed?: Partial<Omit<ProjectDraftItem, 'id'>>): ProjectDraftItem {
  return {
    id: nextStructuredItemId('project'),
    name: seed?.name ?? '',
    role: seed?.role ?? '',
    duration: seed?.duration ?? '',
    description: seed?.description ?? '',
  };
}

function buildExperienceDraftItems(value: unknown): ExperienceDraftItem[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ExperienceDraftItem[]>((items, entry) => {
    if (isObject(entry)) {
      items.push(
        createExperienceDraftItem({
          company: textValue(entry.company),
          position: textValue(entry.position),
          duration: textValue(entry.duration),
          description: textValue(entry.description),
        }),
      );
      return items;
    }
    const description = String(entry || '').trim();
    if (description) {
      items.push(createExperienceDraftItem({ description }));
    }
    return items;
  }, []);
}

function buildProjectDraftItems(value: unknown): ProjectDraftItem[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ProjectDraftItem[]>((items, entry) => {
    if (isObject(entry)) {
      items.push(
        createProjectDraftItem({
          name: textValue(entry.name),
          role: textValue(entry.role),
          duration: textValue(entry.duration),
          description: textValue(entry.description),
        }),
      );
      return items;
    }
    const name = String(entry || '').trim();
    if (name) {
      items.push(createProjectDraftItem({ name }));
    }
    return items;
  }, []);
}

function compactRecord(entries: Array<[string, string]>): Record<string, string> {
  const record: Record<string, string> = {};
  entries.forEach(([key, value]) => {
    const cleaned = value.trim();
    if (cleaned) record[key] = cleaned;
  });
  return record;
}

function experienceItemsToPayload(items: ExperienceDraftItem[]): Record<string, string>[] {
  return items
    .map((item) =>
      compactRecord([
        ['company', item.company],
        ['position', item.position],
        ['duration', item.duration],
        ['description', item.description],
      ]),
    )
    .filter((item) => Object.keys(item).length > 0);
}

function projectItemsToPayload(items: ProjectDraftItem[]): Record<string, string>[] {
  return items
    .map((item) =>
      compactRecord([
        ['name', item.name],
        ['role', item.role],
        ['duration', item.duration],
        ['description', item.description],
      ]),
    )
    .filter((item) => Object.keys(item).length > 0);
}

function skillsToLines(tags: CandidateTag[]): string {
  return tags.map((tag) => `${tag.tag}:${tag.score}`).join('\n');
}

function linesToSkills(text: string): CandidateTag[] {
  const seen = new Set<string>();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nameRaw, scoreRaw] = line.split(/[:：]/);
      const tag = (nameRaw || '').trim();
      const parsed = Number((scoreRaw || '3').trim());
      const score = Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 3;
      return { tag, score };
    })
    .filter((item) => {
      if (!item.tag || seen.has(item.tag)) return false;
      seen.add(item.tag);
      return true;
    });
}

function buildProfileDraft(resumeJson: ResumeJson, tags: CandidateTag[]): ProfileDraft {
  const info = getExtractedInfo(resumeJson);
  const experienceSource = info.experience ?? info.work_experience;
  const projectSource = info.projects ?? info.project_experience;
  return {
    name: textValue(info.name),
    email: textValue(info.email),
    phone: textValue(info.phone),
    intentCity: textValue(info.intent_city),
    summary: textValue(info.summary),
    experienceItems: buildExperienceDraftItems(experienceSource),
    projectItems: buildProjectDraftItems(projectSource),
    additionalInfo: textValue(info.additional_info),
    skillsText: skillsToLines(tags),
  };
}

function StructuredItemsEditor<Item extends StructuredDraftItem>({
  title,
  addLabel,
  items,
  fields,
  emptyHint,
  createItem,
  onChange,
}: {
  title: string;
  addLabel: string;
  items: Item[];
  fields: StructuredDraftField<Item>[];
  emptyHint: string;
  createItem: () => Item;
  onChange: (items: Item[]) => void;
}) {
  const updateItem = (id: string, key: Exclude<keyof Item, 'id'>, value: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? ({ ...item, [key]: value } as Item) : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{title}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange([...items, createItem()])}
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface-soft/60 px-3 py-4 text-sm text-muted-soft">
          {emptyHint}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg border border-hairline bg-canvas px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">
                  {title} {index + 1}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeItem(item.id)}
                  aria-label={`删除${title}${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {fields.map((field) => {
                  const value = item[field.key];
                  return (
                    <div key={String(field.key)} className={field.className}>
                      {field.multiline ? (
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-ink">
                            {field.label}
                          </span>
                          <textarea
                            className="min-h-[96px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
                            placeholder={field.placeholder}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) => updateItem(item.id, field.key, event.target.value)}
                          />
                        </label>
                      ) : (
                        <Input
                          label={field.label}
                          placeholder={field.placeholder}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(event) => updateItem(item.id, field.key, event.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileEditForm({
  draft,
  onChange,
}: {
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
}) {
  const patch = <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };

  const experienceFields: StructuredDraftField<ExperienceDraftItem>[] = [
    { key: 'company', label: '公司', placeholder: '例如：某 AI 公司' },
    { key: 'position', label: '职位', placeholder: '例如：算法工程师' },
    { key: 'duration', label: '时间', placeholder: '例如：2022-2025' },
    {
      key: 'description',
      label: '经历描述',
      placeholder: '补充这段工作里做了什么、结果如何',
      multiline: true,
      className: 'sm:col-span-3',
    },
  ];

  const projectFields: StructuredDraftField<ProjectDraftItem>[] = [
    { key: 'name', label: '项目名', placeholder: '例如：智能招聘助手' },
    { key: 'role', label: '角色', placeholder: '例如：项目负责人' },
    { key: 'duration', label: '时间', placeholder: '例如：2024.03-2024.12' },
    {
      key: 'description',
      label: '项目描述',
      placeholder: '补充项目目标、职责和结果',
      multiline: true,
      className: 'sm:col-span-3',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="姓名" value={draft.name} onChange={(event) => patch('name', event.target.value)} />
        <Input label="邮箱" value={draft.email} onChange={(event) => patch('email', event.target.value)} />
        <Input label="电话" value={draft.phone} onChange={(event) => patch('phone', event.target.value)} />
        <Input
          label="意向城市"
          value={draft.intentCity}
          onChange={(event) => patch('intentCity', event.target.value)}
          placeholder="例如：上海"
        />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">个人简介</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
          value={draft.summary}
          onChange={(event) => patch('summary', event.target.value)}
        />
      </label>
      <StructuredItemsEditor
        title="工作经历"
        addLabel="新增工作经历"
        items={draft.experienceItems}
        fields={experienceFields}
        emptyHint="还没有补充工作经历，点击右上角可以新增一条。"
        createItem={() => createExperienceDraftItem()}
        onChange={(items) => patch('experienceItems', items)}
      />
      <StructuredItemsEditor
        title="项目经历"
        addLabel="新增项目经历"
        items={draft.projectItems}
        fields={projectFields}
        emptyHint="还没有补充项目经历，点击右上角可以新增一条。"
        createItem={() => createProjectDraftItem()}
        onChange={(items) => patch('projectItems', items)}
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">其他备注</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
          value={draft.additionalInfo}
          onChange={(event) => patch('additionalInfo', event.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">技能标签</span>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:shadow-apple-focus"
          placeholder="每行一个：Python:5"
          value={draft.skillsText}
          onChange={(event) => patch('skillsText', event.target.value)}
        />
      </label>
    </div>
  );
}

function rematchToastMessage(jobs: { id: number; title: string }[]): string {
  if (jobs.length === 0) return '候选人档案已保存';
  if (jobs.length === 1) {
    return `候选人档案已保存，已同步刷新「${jobs[0].title}」的匹配结果`;
  }
  return `候选人档案已保存，已同步刷新 ${jobs.length} 个岗位的匹配结果`;
}

function SourceInfoCard({ source }: { source: CandidateSourceInfo | null | undefined }) {
  if (!source) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>来源信息</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-muted-soft">暂无来源记录</p>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>来源信息</CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted">来源渠道</dt>
            <dd className="font-medium text-ink">{source.channel || '未填写'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">目标岗位</dt>
            <dd className="text-body">{source.target_job_title || '未关联'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">岗位带出城市/部门</dt>
            <dd className="text-body">
              {source.target_job_city || '未设置'} / {source.target_job_department || '未设置'}
            </dd>
          </div>
          {source.referrer && (
            <div>
              <dt className="text-xs text-muted">推荐人</dt>
              <dd className="text-body">{source.referrer}</dd>
            </div>
          )}
          {source.note && (
            <div>
              <dt className="text-xs text-muted">备注</dt>
              <dd className="text-body">{source.note}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">上传批次</dt>
            <dd className="text-body">#{source.batch_id}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

// ---- 主页面 ----

export function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const candidateId = Number(id);
  const isInvalidId = !id || Number.isNaN(candidateId);
  const { role } = useAuth();
  const canReassign = role === 'manager' || role === 'admin';
  const canEditProfile = role !== 'interviewer';
  const toast = useToast();
  const [retryingParse, setRetryingParse] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [exportingCandidate, setExportingCandidate] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);

  // useAsync 无条件调用，fetch 函数在 id 无效时短路，不发送请求
  const { data, loading, error, reload } = useAsync(
    () =>
      isInvalidId
        ? Promise.reject(new Error('invalid id'))
        : api.getCandidate(candidateId),
    [candidateId, isInvalidId]
  );

  const handleRetryParse = async () => {
    if (!data || data.parse_status !== 'failed') return;
    setRetryingParse(true);
    try {
      await api.retryCandidateParse(candidateId);
      toast.success('简历已重新解析');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新解析失败');
    } finally {
      setRetryingParse(false);
    }
  };

  const handleStartEditProfile = () => {
    if (!data) return;
    setProfileDraft(buildProfileDraft(data.resume_json, data.tags));
    setEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    setEditingProfile(false);
    setProfileDraft(null);
  };

  const handleSaveProfile = async () => {
    if (!profileDraft) return;
    setSavingProfile(true);
    try {
      const saved = await api.updateCandidateProfile(candidateId, {
        profile: {
          name: profileDraft.name,
          email: profileDraft.email,
          phone: profileDraft.phone,
          intent_city: profileDraft.intentCity,
          summary: profileDraft.summary,
          experience: experienceItemsToPayload(profileDraft.experienceItems),
          projects: projectItemsToPayload(profileDraft.projectItems),
          additional_info: profileDraft.additionalInfo,
        },
        skills: linesToSkills(profileDraft.skillsText),
      });
      toast.success(rematchToastMessage(saved.rematched_jobs ?? []));
      setEditingProfile(false);
      setProfileDraft(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存候选人档案失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportCandidate = async () => {
    setExportingCandidate(true);
    try {
      const blob = await api.exportCandidate(candidateId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `candidate-${candidateId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('简历已导出');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出简历失败');
    } finally {
      setExportingCandidate(false);
    }
  };

  // 所有 hook 调用完毕后再做早返回
  if (isInvalidId) {
    return (
      <div>
        <Link
          to="/candidates"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 候选人列表
        </Link>
        <div className="mt-4">
          <ErrorState message="无效的候选人 ID" />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link
          to="/candidates"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 候选人列表
        </Link>
        <div className="mt-4">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { name_masked, resume_json, tags, created_at, source, parse_status, parse_error } = data;
  const hasTags = tags && tags.length > 0;
  const coreTags = hasTags ? getCoreSkillTags(tags) : [];
  const hiddenSkillCount = hasTags ? Math.max(tags.length - coreTags.length, 0) : 0;
  const parseFailed = parse_status === 'failed';

  return (
    <div>
      {/* 面包屑导航 */}
      <nav aria-label="面包屑" className="mb-4">
        <Link
          to="/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          候选人
        </Link>
        <span className="mx-1.5 text-sm text-muted-soft">/</span>
        <span className="text-sm text-ink">{name_masked}</span>
      </nav>

      {/* 页头 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display text-ink">
            {name_masked}
          </h1>
          <p className="mt-1 text-sm text-muted">
            录入时间：{formatDate(created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasTags && (
            <Badge tone="neutral">核心 {coreTags.length} / 共 {tags.length} 个技能</Badge>
          )}
          {canEditProfile && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={exportingCandidate}
              onClick={handleExportCandidate}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              导出简历
            </Button>
          )}
        </div>
      </div>

	      <Reveal as="div" className="grid grid-cols-1 gap-6 lg:grid-cols-3" stagger={0.1} y={20}>
	        {/* 左栏 — 候选人判断 */}
		        <div className="lg:col-span-1">
		          <div className="space-y-4">
		            <CandidateJudgementCard
		              resumeJson={resume_json}
		              source={source}
		              tags={tags}
		              coreTags={coreTags}
		              hiddenSkillCount={hiddenSkillCount}
		            />
		            <SourceInfoCard source={source} />
		          </div>
		        </div>

        {/* 右栏 — 简历详情 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>简历详情</CardTitle>
              {editingProfile ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelEditProfile}
                    disabled={savingProfile}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    取消
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    loading={savingProfile}
                    onClick={handleSaveProfile}
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    保存修改
                  </Button>
                </div>
              ) : canEditProfile ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleStartEditProfile}
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                  编辑档案
                </Button>
              ) : null}
            </CardHeader>
            <CardBody>
              {parseFailed && (
                <div className="mb-4 rounded-md border border-danger-200 bg-danger-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-danger-700">简历解析失败</p>
                        <p className="mt-1 text-sm leading-relaxed text-danger-700">
                          {parse_error || '原始文件已保留，可以重新解析，也可以直接手动补全档案。'}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={retryingParse}
                      onClick={handleRetryParse}
                      className="shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      重新解析
                    </Button>
                  </div>
                </div>
              )}
              {editingProfile && profileDraft ? (
                <ProfileEditForm draft={profileDraft} onChange={setProfileDraft} />
              ) : resume_json && Object.keys(resume_json).length > 0 ? (
                <ResumeJsonView resumeJson={resume_json} />
              ) : (
                <p className="text-sm text-muted-soft">暂无简历结构化内容</p>
              )}
            </CardBody>
          </Card>
        </div>
      </Reveal>

      {/* 招聘进展 */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>招聘进展</CardTitle>
            {canReassign && (
              <div className="mt-2">
                <ReassignOwner
                  candidateId={candidateId}
                  currentOwnerId={data.owner_hr_id}
                  onReassigned={reload}
                />
              </div>
            )}
          </CardHeader>
          <CardBody>
            <PipelineProgress candidateId={candidateId} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
