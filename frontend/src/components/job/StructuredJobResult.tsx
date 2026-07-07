import type { ReactNode } from 'react';
import { Badge } from '../ui';
import type { JobStructured } from '../../types';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function StructuredJobResult({ structured }: { structured: JobStructured }) {
  const entries = Object.entries(structured);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-soft">暂无结构化内容</p>;
  }

  const labels: Record<string, string> = {
    education: '学历要求',
    major: '专业要求',
    skills: '技能要求',
    skill_tags_raw: '技能标签',
    experience: '工作经验',
    responsibilities: '岗位职责',
    requirements: '任职要求',
  };

  return (
    <dl className="space-y-3">
      {entries.map(([key, value]) => {
        const label = labels[key] ?? key;
        let content: ReactNode;

        if (value === null || value === undefined || value === '') {
          content = <span className="text-muted-soft">—</span>;
        } else if (isStringArray(value)) {
          content = (
            <div className="flex flex-wrap gap-1.5">
              {value.map((tag) => (
                <Badge key={tag} tone="brand">
                  {tag}
                </Badge>
              ))}
            </div>
          );
        } else if (Array.isArray(value)) {
          content = (
            <ul className="ml-4 list-disc space-y-0.5 text-sm text-body">
              {value.map((item, index) => (
                <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          );
        } else if (typeof value === 'object') {
          content = (
            <pre className="text-xs whitespace-pre-wrap text-muted">
              {JSON.stringify(value, null, 2)}
            </pre>
          );
        } else {
          content = <span className="text-sm text-body">{String(value)}</span>;
        }

        return (
          <div key={key}>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd>{content}</dd>
          </div>
        );
      })}
    </dl>
  );
}
