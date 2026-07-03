import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

interface EnterprisePageProps {
  children: ReactNode;
  className?: string;
}

export function EnterprisePage({ children, className }: EnterprisePageProps) {
  return <div className={cn('enterprise-page', className)}>{children}</div>;
}

interface EnterpriseHeroProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  metrics?: ReactNode;
  className?: string;
}

export function EnterpriseHero({
  title,
  description,
  actions,
  metrics,
  className,
}: EnterpriseHeroProps) {
  return (
    <section className={cn('enterprise-hero', className)}>
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="enterprise-hero-actions">{actions}</div>}
      {metrics && <div className="enterprise-metrics">{metrics}</div>}
    </section>
  );
}

interface EnterpriseMetricProps {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export function EnterpriseMetric({ label, value, tone = 'default' }: EnterpriseMetricProps) {
  return (
    <div className="enterprise-metric">
      <span>{label}</span>
      <strong className={cn(tone !== 'default' && `enterprise-metric-${tone}`)}>{value}</strong>
    </div>
  );
}

interface EnterpriseSearchPanelProps {
  children: ReactNode;
  className?: string;
}

export function EnterpriseSearchPanel({ children, className }: EnterpriseSearchPanelProps) {
  return (
    <section className={cn('enterprise-search-panel', className)}>
      {children}
    </section>
  );
}

interface EnterpriseTableCardProps {
  title?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function EnterpriseTableCard({
  title,
  summary,
  children,
  footer,
  className,
}: EnterpriseTableCardProps) {
  return (
    <section className={cn('enterprise-table-card', className)}>
      {(title || summary) && (
        <header className="enterprise-table-card-header">
          {title && <h2>{title}</h2>}
          {summary && <span>{summary}</span>}
        </header>
      )}
      <div className="enterprise-table-scroll">{children}</div>
      {footer && <footer className="enterprise-table-footer">{footer}</footer>}
    </section>
  );
}

interface EnterpriseEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EnterpriseEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EnterpriseEmptyStateProps) {
  return (
    <div className={cn('enterprise-empty-state', className)}>
      {Icon && (
        <div className="enterprise-empty-icon">
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div className="enterprise-empty-action">{action}</div>}
    </div>
  );
}

interface EnterpriseDetailPanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function EnterpriseDetailPanel({ title, children, className }: EnterpriseDetailPanelProps) {
  return (
    <aside className={cn('enterprise-detail-panel', className)}>
      <header>
        <h2>{title}</h2>
      </header>
      <div className="enterprise-detail-body">{children}</div>
    </aside>
  );
}

interface DescriptionItem {
  label: string;
  value: ReactNode;
}

interface EnterpriseDescriptionSectionProps {
  title: string;
  items: DescriptionItem[];
  className?: string;
}

export function EnterpriseDescriptionSection({
  title,
  items,
  className,
}: EnterpriseDescriptionSectionProps) {
  return (
    <section className={cn('enterprise-description-section', className)}>
      <h3 className="enterprise-section-title">{title}</h3>
      <dl className="enterprise-description-list">
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
