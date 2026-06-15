import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate } from '../../lib/formatDate';
import {
  Card, CardHeader, CardTitle, Spinner, ErrorState, PageHeader, Select, Badge,
} from '../../components/ui';
import type { Role } from '../../types';

const ROLES: Role[] = ['recruiter', 'interviewer', 'manager', 'admin'];
const ROLE_LABEL: Record<Role, string> = {
  recruiter: '招聘专员', interviewer: '面试官', manager: '经理', admin: '管理员',
};

export function UsersManagementContent() {
  const { data, loading, error, reload } = useAsync(() => api.listUsers(), []);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function changeRole(id: number, role: Role) {
    setBusyId(id);
    try { await api.updateUser(id, { role }); await reload(); }
    finally { setBusyId(null); }
  }
  async function toggleActive(id: number, isActive: boolean) {
    setBusyId(id);
    try { await api.updateUser(id, { is_active: isActive }); await reload(); }
    finally { setBusyId(null); }
  }

  return (
    <>
      {loading && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}
      {!loading && error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && (
        <Card>
          <CardHeader><CardTitle>成员列表</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">姓名</th>
                  <th className="px-5 py-3">邮箱</th>
                  <th className="px-5 py-3">角色</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{u.name || '—'}</td>
                    <td className="px-5 py-3 text-muted">{u.email}</td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`角色-${u.id}`}
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3">
                      {u.is_active
                        ? <Badge tone="success">启用</Badge>
                        : <Badge tone="danger">停用</Badge>}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {u.created_at ? formatDate(u.created_at) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        disabled={busyId === u.id}
                        onClick={() => toggleActive(u.id, !u.is_active)}
                        className="text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
                      >
                        {u.is_active ? '停用' : '启用'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

export function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="用户管理" description="管理团队成员的角色与账号状态" />
      <UsersManagementContent />
    </div>
  );
}
