// 面试报告详情页 — 通过 interview ID 查看历史 AI 预筛报告。

import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Spinner } from '../components/ui';
import { InterviewReport } from '../components/InterviewReport';

export function InterviewReportPage() {
  const { id } = useParams<{ id: string }>();
  const interviewId = Number(id);
  const isInvalidId = !id || Number.isNaN(interviewId);

  // useAsync 无条件调用 — ID 无效时短路，不发 NaN 请求
  const { data, loading, error, reload } = useAsync(
    () =>
      isInvalidId
        ? Promise.reject(new Error('invalid id'))
        : api.getInterview(interviewId),
    [interviewId, isInvalidId]
  );

  // ID 无效守卫 — 在所有 hook 调用之后
  if (isInvalidId) {
    return (
      <div>
        <Link
          to="/interviews"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 返回面试列表
        </Link>
        <div className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          无效的面试 ID
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
          to="/interviews"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 返回面试列表
        </Link>
        <div className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error.message}
          <button
            onClick={reload}
            className="ml-3 font-medium underline hover:no-underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/interviews"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          ← 返回面试列表
        </Link>
        <h1 className="text-2xl font-display text-ink">
          面试报告 #{data.id}
        </h1>
        <p className="mt-1 text-sm text-muted">
          候选人 ID {data.candidate_id} · 岗位 ID {data.job_id}
        </p>
      </div>

      <InterviewReport
        report={data.ai_report}
        meta={{
          interviewId: data.id,
          candidateId: data.candidate_id,
          jobId: data.job_id,
          createdAt: data.created_at,
        }}
      />
    </div>
  );
}
