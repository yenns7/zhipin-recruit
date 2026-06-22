import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/formatDate';
import { INTERVIEW_ROUNDS, roundLabel } from '../../lib/interviewRecords';
import type {
  CandidateListItem,
  InterviewAssignment,
  InterviewRound,
  InterviewerOption,
  JobListItem,
  Role,
} from '../../types';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Input, Select } from '../ui';

const ROLE_LABEL: Record<Role, string> = {
  recruiter: '招聘专员',
  interviewer: '面试官',
  manager: '经理',
  admin: '管理员',
};

interface InterviewAssignmentPanelProps {
  candidates: CandidateListItem[];
  jobs: JobListItem[];
  interviewers: InterviewerOption[];
  assignments: InterviewAssignment[];
  onCreated: () => void;
}

export function InterviewAssignmentPanel({
  candidates,
  jobs,
  interviewers,
  assignments,
  onCreated,
}: InterviewAssignmentPanelProps) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [round, setRound] = useState<InterviewRound>('round_1');
  const [interviewerId, setInterviewerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const recentAssignments = useMemo(() => assignments.slice(0, 6), [assignments]);

  async function handleCreate() {
    const cid = Number(candidateId);
    const jid = Number(jobId);
    const iid = Number(interviewerId);
    if (!cid || !jid || !iid) {
      setMessage('请选择候选人、岗位和面试官');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.createInterviewAssignment({
        candidate_id: cid,
        job_id: jid,
        round,
        interviewer_id: iid,
        scheduled_at: scheduledAt || undefined,
        location: location.trim(),
        note: note.trim(),
      });
      setCandidateId('');
      setJobId('');
      setInterviewerId('');
      setScheduledAt('');
      setLocation('');
      setNote('');
      setMessage('面试安排已保存');
      onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>面试安排</CardTitle>
            <p className="mt-1 text-xs text-muted-soft">
              指派面试官、记录时间与会议链接，反馈仍在下方待填写区域完成
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? '收起' : '安排面试'}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {open && (
          <div className="mb-5 space-y-3 rounded-lg border border-hairline bg-surface-soft p-4">
            {(candidates.length === 0 || jobs.length === 0 || interviewers.length === 0) && (
              <div className="grid gap-2 md:grid-cols-3">
                {candidates.length === 0 && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">暂无候选人，请先上传简历。</p>
                    <Link to="/upload" className="mt-1 inline-flex font-semibold text-ink hover:underline">
                      上传简历
                    </Link>
                  </div>
                )}
                {jobs.length === 0 && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">暂无可选岗位。</p>
                    <Link to="/jobs" className="mt-1 inline-flex font-semibold text-ink hover:underline">
                      没有目标岗位？新建岗位
                    </Link>
                  </div>
                )}
                {interviewers.length === 0 && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">
                      暂无可选面试官，请管理员先创建或启用面试官账号。
                    </p>
                    {role === 'admin' ? (
                      <Link to="/admin/users" className="mt-1 inline-flex font-semibold text-ink hover:underline">
                        去用户管理
                      </Link>
                    ) : (
                      <p className="mt-1 font-semibold text-ink">联系管理员创建或启用面试官账号</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <Select label="候选人" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                  <option value="">选择候选人</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name_masked}
                    </option>
                  ))}
                </Select>
                <Link to="/upload" className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline">
                  没有目标候选人？上传简历
                </Link>
              </div>
              <div>
                <Select label="岗位" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">选择岗位</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </Select>
                <Link to="/jobs" className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline">
                  没有目标岗位？新建岗位
                </Link>
              </div>
              <Select label="轮次" value={round} onChange={(e) => setRound(e.target.value as InterviewRound)}>
                {INTERVIEW_ROUNDS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Select label="面试官" value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
                <option value="">选择面试官</option>
                {interviewers.map((interviewer) => (
                  <option key={interviewer.id} value={interviewer.id}>
                    {interviewer.name}（{ROLE_LABEL[interviewer.role] ?? interviewer.role}）
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="面试时间"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <Input
                label="地点 / 会议链接"
                value={location}
                placeholder="例：腾讯会议 123 或会议室 A"
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <textarea
              className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              rows={2}
              placeholder="安排备注"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {message && <p className="text-sm text-muted">{message}</p>}
            <Button type="button" size="sm" loading={saving} disabled={saving} onClick={handleCreate}>
              保存安排
            </Button>
          </div>
        )}

        {recentAssignments.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="暂无面试安排"
            description="安排面试后，这里会显示待执行的面试协同信息"
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recentAssignments.map((item) => (
              <div key={item.id} className="rounded-lg border border-hairline bg-canvas px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{item.name_masked ?? `候选人 #${item.candidate_id}`}</p>
                      <Badge tone="warning">{roundLabel(item.round)}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{item.job_title ?? `岗位 #${item.job_id}`}</p>
                    <p className="mt-2 text-xs text-muted-soft">
                      {item.scheduled_at ? formatDate(item.scheduled_at) : '未定时间'}
                      {item.interviewer_name ? ` · ${item.interviewer_name}` : ''}
                    </p>
                    {item.location && <p className="mt-1 text-xs text-body">{item.location}</p>}
                  </div>
                  <Badge tone="brand">{item.status || 'scheduled'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
