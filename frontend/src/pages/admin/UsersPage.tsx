import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate } from '../../lib/formatDate';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui';
import type { Role } from '../../types';

const ROLES: Role[] = ['recruiter', 'interviewer', 'manager', 'admin'];
const ROLE_LABEL: Record<Role, string> = {
  recruiter: '招聘专员', interviewer: '面试官', manager: '经理', admin: '管理员',
};

export function UsersManagementContent() {
  const { data, loading, error, reload } = useAsync(() => api.listUsers(), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'interviewer' as Role,
  });
  const [resetPasswords, setResetPasswords] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

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

  async function createUser() {
    setCreating(true);
    setMessage(null);
    try {
      await api.createUser({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
      });
      setCreateForm({ name: '', email: '', password: '', role: 'interviewer' });
      setMessage('账号已创建');
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建账号失败');
    } finally {
      setCreating(false);
    }
  }

  async function resetUserPassword(id: number) {
    const password = resetPasswords[id] ?? '';
    if (password.length < 6) {
      setMessage('新密码至少 6 位');
      return;
    }
    setBusyId(id);
    setMessage(null);
    try {
      await api.resetUserPassword(id, password);
      setResetPasswords((current) => ({ ...current, [id]: '' }));
      setMessage('密码已重置');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {loading && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}
      {!loading && error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && (
        <div className="space-y-6">
          <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3 text-sm text-muted">
            试点建议一人一个账号：招聘专员、面试官、主管分别登录，BI 才能看清谁负责、谁推进、谁反馈。
          </div>

          <Card>
            <CardHeader><CardTitle>创建账号</CardTitle></CardHeader>
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  label="姓名"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="例如：业务面试官"
                />
                <Input
                  label="邮箱"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((current) => ({ ...current, email: e.target.value }))}
                  placeholder="user@company.com"
                />
                <Input
                  label="初始密码"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((current) => ({ ...current, password: e.target.value }))}
                  placeholder="至少 6 位"
                />
                <Select
                  label="角色"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((current) => ({ ...current, role: e.target.value as Role }))}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </Select>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="button" loading={creating} disabled={creating} onClick={createUser}>
                  创建账号
                </Button>
                {message && <p className="text-sm text-muted">{message}</p>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>成员列表</CardTitle></CardHeader>
            {(data ?? []).length === 0 ? (
              <CardBody>
                <EmptyState
                  title="暂无成员账号"
                  description="先创建管理员、招聘专员和面试官账号，再开始试点。"
                />
              </CardBody>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">姓名</th>
                    <th className="px-5 py-3">邮箱</th>
                    <th className="px-5 py-3">角色</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">创建时间</th>
                    <th className="px-5 py-3">重置密码</th>
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
                      <td className="px-5 py-3">
                        <div className="flex min-w-[220px] items-end gap-2">
                          <Input
                            label="新密码"
                            type="password"
                            value={resetPasswords[u.id] ?? ''}
                            onChange={(e) => setResetPasswords((current) => ({
                              ...current,
                              [u.id]: e.target.value,
                            }))}
                            placeholder="至少 6 位"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busyId === u.id}
                            onClick={() => resetUserPassword(u.id)}
                          >
                            重置密码
                          </Button>
                        </div>
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
            )}
          </Card>
        </div>
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
