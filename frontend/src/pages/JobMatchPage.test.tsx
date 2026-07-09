import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JobMatchPage } from './JobMatchPage';
import { api } from '../lib/api';
import type {
  CandidateListItem,
  CandidateListResponse,
  MatchResponse,
  PipelineBoard,
} from '../types';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      matchJob: vi.fn(),
      getPipelineBoard: vi.fn(),
      searchCandidates: vi.fn(),
      previewJobMatch: vi.fn(),
      movePipeline: vi.fn(),
      batchAddToPipeline: vi.fn(),
    },
  };
});

const matchResponse: MatchResponse = {
  jobId: 21,
  results: [
    {
      candidateId: 101,
      candidateName: '张候选',
      score: 0.86,
      matchedRequiredSkills: ['React'],
      missingRequiredSkills: ['TypeScript'],
      matchedPreferredSkills: [],
      yearsOfExperience: null,
      summary: '',
    },
  ],
};

const pipelineBoard: PipelineBoard = {
  jobId: 21,
  jobTitle: '前端工程师',
  stageOrder: ['pending'],
  candidates: [],
};

const libraryCandidates: CandidateListItem[] = [
  {
    id: 201,
    nameMasked: '李补找',
    ownerHrId: 7,
    createdAt: '2026-07-06T00:00:00Z',
    tagCount: 1,
    topTags: [{ tag: 'React', score: 0.92 }],
  },
];

const candidateListResponse: CandidateListResponse = {
  candidates: libraryCandidates,
  total: 1,
  page: 1,
  perPage: 50,
  pages: 1,
};

function renderJobMatchPage() {
  return render(
    <MemoryRouter initialEntries={['/jobs/21/match']}>
      <Routes>
        <Route path="/jobs/:id/match" element={<JobMatchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JobMatchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.matchJob).mockResolvedValue(matchResponse);
    vi.mocked(api.getPipelineBoard).mockResolvedValue(pipelineBoard);
    vi.mocked(api.searchCandidates).mockResolvedValue(candidateListResponse);
    vi.mocked(api.previewJobMatch).mockResolvedValue({
      jobId: 21,
      results: [],
    });
  });

  it('uses the shared alert-style error state when manual preview fails in all-candidates mode', async () => {
    vi.mocked(api.previewJobMatch).mockRejectedValueOnce(new Error('人工补找匹配失败'));

    renderJobMatchPage();

    expect(await screen.findByRole('button', { name: '全部候选人' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全部候选人' }));

    await waitFor(() => expect(api.searchCandidates).toHaveBeenCalled());
    await waitFor(() =>
      expect(api.previewJobMatch).toHaveBeenCalledWith(21, [201]),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('人工补找匹配失败');
  });
});
