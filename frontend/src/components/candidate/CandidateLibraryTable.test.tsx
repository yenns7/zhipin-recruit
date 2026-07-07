import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { CandidateLibraryTable } from './CandidateLibraryTable';
import type { CandidateListItem, MatchResultItem } from '../../features/candidates/types';

const candidate: CandidateListItem = {
  id: 17,
  name_masked: '张**',
  email_masked: 'zh***@example.com',
  phone_masked: '138****0000',
  owner_hr_id: 3,
  created_at: '2026-07-01T08:00:00Z',
  parse_status: 'ok',
  tag_count: 3,
  max_score: 5,
  intent_city: '深圳',
  education_summary: '本科 · 计算机相关',
  latest_experience: {
    company: '字节测试',
    position: '前端工程师',
    duration: '2022-2026',
  },
  source: {
    batch_id: 1,
    channel: 'BOSS直聘',
    source_link: '',
    referrer: '李经理',
    target_job_id: 9,
    target_job_title: '高级前端工程师',
    target_job_city: '深圳',
    target_job_department: '技术研发部',
    note: '',
    created_at: '2026-07-01T08:00:00Z',
  },
  top_tags: [
    { tag: 'React', score: 5 },
    { tag: 'TypeScript', score: 4 },
  ],
};

const matchByCandidateId = new Map<number, MatchResultItem>([
  [
    17,
    {
      candidate_id: 17,
      name_masked: '张**',
      score: 82,
      matched_tags: ['React'],
      missing_tags: ['招聘流程'],
    },
  ],
]);

describe('CandidateLibraryTable', () => {
  it('renders the candidate list panel and row actions', () => {
    render(
      <CandidateLibraryTable
        filteredCandidates={[candidate]}
        totalCandidates={12}
        targetJobId="9"
        matchByCandidateId={matchByCandidateId}
        matchPreviewLoading={false}
        matchPreviewError={false}
        addingCandidateId={null}
        onAddToJob={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '候选人列表' })).toBeInTheDocument();
    expect(screen.getByText('当前显示 1 / 12 份')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看完整简历' })).toHaveAttribute(
      'href',
      '/candidates/17'
    );
    expect(screen.getByRole('button', { name: /加入所选岗位流程/ })).toBeInTheDocument();
    expect(screen.getByText('来源渠道：BOSS直聘')).toBeInTheDocument();
    expect(screen.getByText('岗位归属：深圳 / 技术研发部')).toBeInTheDocument();
    expect(screen.getByText('匹配 82%')).toBeInTheDocument();
  });
});
