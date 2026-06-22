import { useState } from 'react';
import { FileCode2, ScrollText, ShieldCheck } from 'lucide-react';
import { Badge, PageHeader } from '../../components/ui';
import { cn } from '../../lib/cn';
import { AiArchitectureContent } from './AiArchitecturePage';
import { AuditLogContent } from './AuditLogPage';
import { UsersManagementContent } from './UsersPage';

type SettingsSection = 'users' | 'ai' | 'audit';
type SectionIcon = typeof ShieldCheck;

const SECTIONS: Array<{
  id: SettingsSection;
  title: string;
  description: string;
  icon: SectionIcon;
  badge: string;
}> = [
  {
    id: 'users',
    title: '账号管理',
    description: '管理团队成员、角色权限和账号启停状态。',
    icon: ShieldCheck,
    badge: '账号',
  },
  {
    id: 'audit',
    title: '审计日志',
    description: '查看关键写操作流水，排查谁在什么时候改了什么。',
    icon: ScrollText,
    badge: '审计',
  },
  {
    id: 'ai',
    title: 'AI 边界',
    description: '查看 AI 助手提示词、工具权限和后端接入边界。',
    icon: FileCode2,
    badge: 'AI',
  },
];

export function SystemSettingsPage() {
  const [openSection, setOpenSection] = useState<SettingsSection>('users');

  return (
    <div className="space-y-6">
      <PageHeader
        title="系统设置"
        description="管理员低频配置入口统一收纳，展开需要处理的设置项即可"
        eyebrow={<Badge tone="glass">仅管理员可见</Badge>}
      />

      <div
        role="tablist"
        aria-label="系统设置分类"
        className="flex flex-wrap gap-2 border-b border-hairline pb-3"
      >
        {SECTIONS.map((section) => {
          const active = openSection === section.id;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              onClick={() => setOpenSection(section.id)}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-left text-sm font-medium transition-colors',
                active
                  ? 'border-ink bg-ink text-on-primary shadow-apple-xs'
                  : 'border-hairline bg-surface-soft text-body hover:border-surface-strong hover:bg-surface-card',
              )}
              aria-selected={active}
            >
              <Icon className="h-4 w-4" />
              {section.title}
              <Badge tone={active ? 'glass' : 'neutral'}>{section.badge}</Badge>
            </button>
          );
        })}
      </div>

      <section className="rounded-lg border border-hairline bg-canvas px-4 py-4">
        <div className="mb-4 rounded-md border border-hairline bg-surface-soft px-4 py-3">
          <p className="text-sm font-medium text-ink">
            {SECTIONS.find((section) => section.id === openSection)?.title}
          </p>
          <p className="mt-1 text-xs text-muted">
            {SECTIONS.find((section) => section.id === openSection)?.description}
          </p>
        </div>
        {openSection === 'users' && <UsersManagementContent />}
        {openSection === 'audit' && <AuditLogContent />}
        {openSection === 'ai' && <AiArchitectureContent />}
      </section>
    </div>
  );
}
