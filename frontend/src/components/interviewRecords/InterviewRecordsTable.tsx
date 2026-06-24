import { Link } from 'react-router-dom';
import { Bot, MessageSquareText } from 'lucide-react';
import { formatDate } from '../../lib/formatDate';
import {
  recordSummary,
  resultLabel,
  resultTone,
  roundLabel,
} from '../../lib/interviewRecords';
import type { InterviewListItem } from '../../types';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
} from '../ui';

interface InterviewRecordsTableProps {
  items: InterviewListItem[];
  onSelect: (item: InterviewListItem) => void;
}

export function InterviewRecordsTable({ items, onSelect }: InterviewRecordsTableProps) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={MessageSquareText}
          title="没有符合条件的面试内容"
          description="换一个筛选条件，或先在流程中录入面试反馈"
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>反馈记录</CardTitle>
          <span className="text-xs text-muted-soft">共 {items.length} 条</span>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="px-5 py-3">候选人</th>
              <th className="px-5 py-3">岗位</th>
              <th className="px-5 py-3">轮次</th>
              <th className="px-5 py-3">面试官</th>
              <th className="px-5 py-3">评分</th>
              <th className="px-5 py-3">结果</th>
              <th className="px-5 py-3">关键反馈</th>
              <th className="px-5 py-3">提交时间</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={`${item.type}-${item.id}`}
                className="border-b border-hairline last:border-0 hover:bg-surface-soft"
              >
                <td className="px-5 py-3">
                  <Link
                    to={`/candidates/${item.candidate_id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {item.name_masked ?? `#${item.candidate_id}`}
                  </Link>
                </td>
                <td className="px-5 py-3 text-muted">{item.job_title ?? `#${item.job_id}`}</td>
                <td className="px-5 py-3">
                  {item.type === 'ai' ? (
                    <Badge tone="brand" className="gap-1">
                      <Bot className="h-3 w-3" />
                      AI 预筛
                    </Badge>
                  ) : (
                    <Badge tone="warning">{roundLabel(item.round)}</Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-muted">
                  {item.interviewer_name ?? (item.type === 'ai' ? 'AI' : '—')}
                </td>
                <td className="px-5 py-3 tabular-nums">{item.score ?? '—'}</td>
                <td className="px-5 py-3">
                  <Badge tone={resultTone(item.pass)}>{resultLabel(item.pass)}</Badge>
                </td>
                <td className="max-w-[280px] px-5 py-3 text-muted">
                  <span className="block max-h-10 overflow-hidden">{recordSummary(item)}</span>
                </td>
                <td className="px-5 py-3 text-muted">
                  {item.created_at ? formatDate(item.created_at) : '—'}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="text-xs font-medium text-ink hover:underline"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
