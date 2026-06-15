// 候选人档案页（HR 视角）— 展示技能雷达图（≥3 标签）或横向评分条，以及简历结构化内容。

import { useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Spinner, ErrorState, useToast } from '../../../components/ui';
import { Reveal } from '../../../components/motion';
import { PipelineProgress } from '../../../components/candidate/PipelineProgress';
import { ReassignOwner } from '../../../components/candidate/ReassignOwner';
import type { CandidateSourceInfo, CandidateTag, ResumeJson } from '../types';

// Cal.com 近黑配色 hex（recharts 不接受 tailwind 类）
const RADAR_STROKE = '#111111';
const RADAR_FILL = 'rgba(17, 17, 17, 0.08)';
const RADAR_GRID_STROKE = '#e5e7eb';   // hairline
const RADAR_TICK_FILL = '#6b7280';     // muted

// 技能雷达图（≥3 个标签时展示）
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

// 横向评分条（< 3 个标签时展示）
function TagBars({ tags }: { tags: CandidateTag[] }) {
  return (
    <Reveal as="ul" className="space-y-3" stagger={0.06} y={10}>
      {tags.map((t) => (
        <li key={t.tag}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-ink">{t.tag}</span>
            <span className="text-muted">{t.score} / 5</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-card">
            <div
              className="h-full rounded-full bg-ink transition-all"
              style={{ width: `${(t.score / 5) * 100}%` }}
              role="progressbar"
              aria-valuenow={t.score}
              aria-valuemin={0}
              aria-valuemax={5}
              aria-label={t.tag}
            />
          </div>
        </li>
      ))}
    </Reveal>
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
  certifications: '资质证书',
  languages: '语言能力',
  contact: '联系方式',
  name: '姓名',
};

// 优先展示顺序
const SECTION_ORDER = [
  'summary',
  'contact',
  'education',
  'experience',
  'work_experience',
  'skills',
  'projects',
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
  const toast = useToast();
  const [retryingParse, setRetryingParse] = useState(false);

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
  const useRadar = hasTags && tags.length >= 3;
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
        {hasTags && (
          <Badge tone="neutral">{tags.length} 个技能标签</Badge>
        )}
      </div>

      <Reveal as="div" className="grid grid-cols-1 gap-6 lg:grid-cols-3" stagger={0.1} y={20}>
        {/* 左栏 — 技能评估 */}
	        <div className="lg:col-span-1">
	          <div className="space-y-4">
	            <Card>
	              <CardHeader>
	                <CardTitle>{useRadar ? '技能雷达' : '技能评分'}</CardTitle>
	              </CardHeader>
	              <CardBody>
	                {!hasTags ? (
	                  <p className="text-sm text-muted-soft">暂无技能标签</p>
	                ) : useRadar ? (
	                  <TagRadarChart tags={tags} />
	                ) : (
	                  <TagBars tags={tags} />
	                )}
	              </CardBody>
	            </Card>
	            <SourceInfoCard source={source} />
	          </div>
	        </div>

        {/* 右栏 — 简历详情 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>简历详情</CardTitle>
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
                          {parse_error || '原始文件已保留，可以重新解析。'}
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
              {resume_json && Object.keys(resume_json).length > 0 ? (
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
                <ReassignOwner candidateId={candidateId} />
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
