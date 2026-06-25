import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, CalendarPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  buildAssignedPendingFeedback,
  buildPendingFeedback,
  computeInterviewStats,
  DEFAULT_INTERVIEW_FILTERS,
  defaultFocusForRole,
  filterInterviewRecords,
  filterPendingFeedback,
  mergePendingFeedback,
  uniqueInterviewers,
  uniqueJobs,
  type InterviewFiltersState,
  type PendingFeedbackItem,
  type RecordFocus,
} from '../lib/interviewRecords';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Spinner,
} from '../components/ui';
import { InterviewSummary } from '../components/interviewRecords/InterviewSummary';
import { InterviewFilters } from '../components/interviewRecords/InterviewFilters';
import { PendingFeedbackPanel } from '../components/interviewRecords/PendingFeedbackPanel';
import { InterviewRecordsTable } from '../components/interviewRecords/InterviewRecordsTable';
import { InterviewRecordDrawer } from '../components/interviewRecords/InterviewRecordDrawer';
import { InterviewAssignmentPanel } from '../components/interviewRecords/InterviewAssignmentPanel';
import { MyInterviewsPanel } from '../components/interviewRecords/MyInterviewsPanel';
import { FeedbackForm } from '../components/interview/FeedbackForm';
import { InterviewGuidePanel } from '../components/interview/InterviewGuidePanel';
import type {
  CandidateListItem,
  InterviewAssignment,
  InterviewerOption,
  InterviewListItem,
  JobListItem,
  PipelineBoard,
} from '../types';

interface InterviewWorkspaceData {
  records: InterviewListItem[];
  boards: PipelineBoard[];
  jobs: JobListItem[];
  candidates: CandidateListItem[];
  assignments: InterviewAssignment[];
  interviewers: InterviewerOption[];
}

function pendingFeedbackKey(item: PendingFeedbackItem | null): string | null {
  if (!item) return null;
  return `${item.job_id}-${item.candidate_id}-${item.round}`;
}

function positiveIdFromParam(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function focusFromParam(value: string | null): RecordFocus | null {
  if (value === 'pending' || value === 'all' || value === 'passed' || value === 'failed') {
    return value;
  }
  return null;
}

export function InterviewListPage() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedFocus = focusFromParam(searchParams.get('focus'));
  const [focus, setFocus] = useState<RecordFocus>(() => requestedFocus ?? defaultFocusForRole(role));
  const [filters, setFilters] = useState<InterviewFiltersState>(DEFAULT_INTERVIEW_FILTERS);
  const [selectedRecord, setSelectedRecord] = useState<InterviewListItem | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingFeedbackItem | null>(null);
  const [assignmentPanelOpen, setAssignmentPanelOpen] = useState(false);
  const feedbackFormRef = useRef<HTMLDivElement | null>(null);
  const assignmentPanelRef = useRef<HTMLDivElement | null>(null);
  const isInterviewer = role === 'interviewer';
  const requestedJobId = positiveIdFromParam(searchParams.get('job'));
  const requestedCandidateId = positiveIdFromParam(searchParams.get('candidate'));

  const workspaceAsync = useAsync<InterviewWorkspaceData>(async () => {
    const [records, jobs, candidates, assignments, interviewers] = await Promise.all([
      api.listInterviews(),
      isInterviewer ? Promise.resolve([] as JobListItem[]) : api.listJobs(),
      isInterviewer ? Promise.resolve([] as CandidateListItem[]) : api.listCandidates(),
      api.listInterviewAssignments(),
      isInterviewer ? Promise.resolve([] as InterviewerOption[]) : api.listInterviewers(),
    ]);
    const boards = isInterviewer
      ? []
      : await Promise.all(
          jobs.map(async (job) => {
            try {
              return await api.getPipelineBoard(job.id);
            } catch {
              return null;
            }
          }),
        );
    return {
      records,
      jobs,
      candidates,
      assignments,
      interviewers,
      boards: boards.filter((board): board is PipelineBoard => board !== null),
    };
  }, [role, isInterviewer]);

  const records = useMemo(() => workspaceAsync.data?.records ?? [], [workspaceAsync.data]);
  const jobs = useMemo(() => workspaceAsync.data?.jobs ?? [], [workspaceAsync.data]);
  const candidates = useMemo(() => workspaceAsync.data?.candidates ?? [], [workspaceAsync.data]);
  const assignments = useMemo(() => workspaceAsync.data?.assignments ?? [], [workspaceAsync.data]);
  const interviewers = useMemo(() => workspaceAsync.data?.interviewers ?? [], [workspaceAsync.data]);
  const boards = useMemo(() => workspaceAsync.data?.boards ?? [], [workspaceAsync.data]);

  const pipelinePending = useMemo(() => buildPendingFeedback(boards, records), [boards, records]);
  const assignedPending = useMemo(() => buildAssignedPendingFeedback(assignments), [assignments]);
  const pending = useMemo(
    () => role === 'interviewer'
      ? assignedPending
      : mergePendingFeedback(assignedPending, pipelinePending),
    [assignedPending, pipelinePending, role],
  );
  const filteredPending = useMemo(
    () => filterPendingFeedback(pending, filters),
    [pending, filters],
  );
  const filteredRecords = useMemo(
    () => filterInterviewRecords(records, filters, focus),
    [records, filters, focus],
  );
  const stats = useMemo(() => computeInterviewStats(records, pending), [records, pending]);
  const jobOptions = useMemo(() => uniqueJobs(records, jobs), [records, jobs]);
  const interviewerOptions = useMemo(() => uniqueInterviewers(records), [records]);
  const showInterviewerFilter = role === 'manager' || role === 'admin';
  const interviewTitle = role === 'interviewer' ? '我的面试' : '面试任务';
  const emptyInterviewDescription = role === 'interviewer'
    ? '暂无分配给你的面试任务，请等待 HR 或管理员安排。'
    : '可以先安排面试并填写人工反馈，也可以生成 AI 预筛参考';

  const handleOpenAssignmentPanel = useCallback(() => {
    setAssignmentPanelOpen(true);
    window.requestAnimationFrame(() => {
      assignmentPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      assignmentPanelRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handleStartAssignmentFeedback = useCallback(
    (assignment: InterviewAssignment) => {
      const target = pending.find(
        (item) =>
          item.candidate_id === assignment.candidate_id &&
          item.job_id === assignment.job_id &&
          item.round === assignment.round,
      ) ?? {
        candidate_id: assignment.candidate_id,
        name_masked: assignment.name_masked ?? `候选人 #${assignment.candidate_id}`,
        job_id: assignment.job_id,
        job_title: assignment.job_title ?? `岗位 #${assignment.job_id}`,
        round: assignment.round,
        updated_at: assignment.scheduled_at ?? assignment.created_at,
        updated_by_name: assignment.created_by_name,
      };
      setFocus('pending');
      setFilters((current) => ({
        ...current,
        query: '',
        jobId: assignment.job_id,
        round: assignment.round,
      }));
      setSelectedPending(target);
    },
    [pending],
  );

  const handleStartPendingFeedback = useCallback((item: PendingFeedbackItem) => {
    setFocus('pending');
    setSelectedPending(item);
  }, []);

  const focusOptions = [
    { value: 'pending' as const, label: `待我处理 ${pending.length}` },
    { value: 'all' as const, label: '面试记录' },
    { value: 'passed' as const, label: '已通过' },
    { value: 'failed' as const, label: '未通过' },
  ];

  useEffect(() => {
    if (requestedFocus) {
      setFocus(requestedFocus);
    }
  }, [requestedFocus]);

  useEffect(() => {
    if (!requestedCandidateId) return;
    const target = pending.find(
      (item) =>
        item.candidate_id === requestedCandidateId &&
        (requestedJobId === null || item.job_id === requestedJobId),
    );
    if (!target) return;
    setFocus('pending');
    setFilters((current) => ({
      ...current,
      jobId: requestedJobId ?? current.jobId,
    }));
    if (pendingFeedbackKey(selectedPending) !== pendingFeedbackKey(target)) {
      setSelectedPending(target);
    }
  }, [pending, requestedCandidateId, requestedJobId, selectedPending]);

  useEffect(() => {
    if (!selectedPending) return;
    feedbackFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    feedbackFormRef.current?.focus({ preventScroll: true });
  }, [selectedPending]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={interviewTitle}
        description="处理面试安排、待补反馈和面试记录；AI 预筛只作为辅助参考"
        actions={role !== 'interviewer' ? (
          <>
            <Button type="button" onClick={handleOpenAssignmentPanel}>
              <CalendarPlus className="h-4 w-4" />
              安排面试
            </Button>
            <Link to="/interviews/new">
              <Button variant="secondary">AI 预筛参考</Button>
            </Link>
          </>
        ) : undefined}
      />

      {workspaceAsync.loading && (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!workspaceAsync.loading && workspaceAsync.error && (
        <ErrorState message={workspaceAsync.error.message} onRetry={workspaceAsync.reload} />
      )}

      {!workspaceAsync.loading && !workspaceAsync.error && (
        <MyInterviewsPanel
          assignments={assignments}
          onStartFeedback={handleStartAssignmentFeedback}
        />
      )}

      {!workspaceAsync.loading && !workspaceAsync.error && records.length === 0 && pending.length === 0 && (
        <>
          <Card>
            <EmptyState
              icon={Bot}
              title="暂无面试内容"
              description={emptyInterviewDescription}
              action={role !== 'interviewer' ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" size="sm" onClick={handleOpenAssignmentPanel}>
                    <CalendarPlus className="h-4 w-4" />
                    安排面试
                  </Button>
                  <Link to="/interviews/new">
                    <Button variant="secondary" size="sm">
                      AI 预筛参考
                    </Button>
                  </Link>
                </div>
              ) : undefined}
            />
          </Card>
          {role !== 'interviewer' && (
            <div ref={assignmentPanelRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
              <InterviewAssignmentPanel
                candidates={candidates}
                jobs={jobs}
                interviewers={interviewers}
                assignments={assignments}
                open={assignmentPanelOpen}
                onOpenChange={setAssignmentPanelOpen}
                onCreated={workspaceAsync.reload}
              />
            </div>
          )}
        </>
      )}

      {!workspaceAsync.loading && !workspaceAsync.error && (records.length > 0 || pending.length > 0) && (
        <>
          <InterviewSummary stats={stats} />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentedControl
              options={focusOptions}
              value={focus}
              onChange={setFocus}
              className="self-start"
            />
            <p className="text-sm text-muted">
              {role === 'manager' || role === 'admin'
                ? '团队视角：查看所有岗位和面试官反馈'
                : role === 'interviewer'
                  ? '面试官视角：优先处理待填写反馈'
                  : 'HR 视角：优先跟进自己负责候选人的反馈状态'}
            </p>
          </div>

          <InterviewFilters
            filters={filters}
            jobs={jobOptions}
            interviewers={interviewerOptions}
            showInterviewerFilter={showInterviewerFilter}
            onChange={setFilters}
          />

          {role !== 'interviewer' && (
            <div ref={assignmentPanelRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
              <InterviewAssignmentPanel
                candidates={candidates}
                jobs={jobs}
                interviewers={interviewers}
                assignments={assignments}
                open={assignmentPanelOpen}
                onOpenChange={setAssignmentPanelOpen}
                onCreated={workspaceAsync.reload}
              />
            </div>
          )}

          {(focus === 'pending' || pending.length > 0) && (
            <>
              <PendingFeedbackPanel
                items={filteredPending}
                activeKey={pendingFeedbackKey(selectedPending)}
                onStartFeedback={handleStartPendingFeedback}
                canOpenPipeline={!isInterviewer}
              />

              {selectedPending && (
                <div ref={feedbackFormRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>填写面试反馈</CardTitle>
                          <p className="mt-1 text-sm text-muted">
                            {selectedPending.name_masked} · {selectedPending.job_title}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPending(null)}
                        >
                          关闭
                        </Button>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <InterviewGuidePanel
                        candidateId={selectedPending.candidate_id}
                        jobId={selectedPending.job_id}
                        round={selectedPending.round}
                      />
                      <FeedbackForm
                        candidateId={selectedPending.candidate_id}
                        jobId={selectedPending.job_id}
                        initialRound={selectedPending.round}
                        canMovePipeline={!isInterviewer}
                        onSubmitted={() => {
                          setSelectedPending(null);
                          void workspaceAsync.reload();
                        }}
                      />
                    </CardBody>
                  </Card>
                </div>
              )}
            </>
          )}

          {focus !== 'pending' && (
            <InterviewRecordsTable items={filteredRecords} onSelect={setSelectedRecord} />
          )}
        </>
      )}

      {selectedRecord && (
        <InterviewRecordDrawer
          item={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
