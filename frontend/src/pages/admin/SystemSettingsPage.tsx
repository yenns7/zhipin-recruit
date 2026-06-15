import { useState } from 'react';
import { ChevronDown, FileCode2, ShieldCheck } from 'lucide-react';
import { Badge, PageHeader } from '../../components/ui';
import { cn } from '../../lib/cn';
import { AiArchitectureContent } from './AiArchitecturePage';
import { UsersManagementContent } from './UsersPage';

type SettingsSection = 'users' | 'ai';
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
    title: '用户管理',
    description: '管理团队成员、角色权限和账号启停状态。',
    icon: ShieldCheck,
    badge: '账号',
  },
  {
    id: 'ai',
    title: 'AI 提示词看板',
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

      <div className="grid gap-3 lg:grid-cols-2">
        {SECTIONS.map((section) => {
          const active = openSection === section.id;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setOpenSection(section.id)}
              className={cn(
                'flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors',
                active
                  ? 'border-ink bg-canvas shadow-apple-sm'
                  : 'border-hairline bg-surface-soft hover:border-surface-strong hover:bg-canvas',
              )}
              aria-expanded={active}
            >
              <span className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-canvas text-ink">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{section.title}</span>
                    <Badge tone={active ? 'brand' : 'neutral'}>{section.badge}</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted">{section.description}</span>
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'mt-1 h-4 w-4 shrink-0 text-muted transition-transform',
                  active && 'rotate-180 text-ink',
                )}
              />
            </button>
          );
        })}
      </div>

      <section className="rounded-lg border border-hairline bg-canvas px-4 py-4">
        {openSection === 'users' ? <UsersManagementContent /> : <AiArchitectureContent />}
      </section>
    </div>
  );
}
