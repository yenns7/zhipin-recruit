import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { CandidateLibraryTable } from './CandidateLibraryTable';
import type { CandidateListItem, MatchResultItem } from '../../features/candidates/types';

const candidate: CandidateListItem = {
  id: 17,
  nameMasked: '张**',
  emailMasked: 'zh***@example.com',
  phoneMasked: '138****0000',
  ownerHrId: 3,
  createdAt: '2026-07-01T08:00:00Z',
  parseStatus: 'ok',
  tagCount: 3,
  maxScore: 5,
  intentCity: '深圳',
  educationSummary: '本科 · 计算机相关',
  latestExperience: {
    company: '字节测试',
    position: '前端工程师',
    duration: '2022-2026',
  },
  source: {
    batchId: 1,
    channel: 'BOSS直聘',
    source_link: '',
    referrer: '李经理',
    targetJobId: 9,
    targetJobTitle: '高级前端工程师',
    targetJobCity: '深圳',
    targetJobDepartment: '技术研发部',
    note: '',
    createdAt: '2026-07-01T08:00:00Z',
  },
  topTags: [
    { tag: 'React', score: 5 },
    { tag: 'TypeScript', score: 4 },
  ],
};

const matchByCandidateId = new Map<number, MatchResultItem>([
  [
    17,
    {
      candidateId: 17,
      candidateName: '张**',
      score: 82,
      matchedRequiredSkills: ['React'],
      missingRequiredSkills: ['招聘流程'],
      matchedPreferredSkills: [],
      yearsOfExperience: null,
      summary: '',
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
