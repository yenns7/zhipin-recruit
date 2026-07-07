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
  job_id: 21,
  results: [
    {
      candidate_id: 101,
      name_masked: '张候选',
      score: 0.86,
      matched_tags: ['React'],
      missing_tags: ['TypeScript'],
    },
  ],
};

const pipelineBoard: PipelineBoard = {
  job_id: 21,
  job_title: '前端工程师',
  stage_order: ['pending'],
  candidates: [],
};

const libraryCandidates: CandidateListItem[] = [
  {
    id: 201,
    name_masked: '李补找',
    owner_hr_id: 7,
    created_at: '2026-07-06T00:00:00Z',
    tag_count: 1,
    top_tags: [{ tag: 'React', score: 0.92 }],
  },
];

const candidateListResponse: CandidateListResponse = {
  candidates: libraryCandidates,
  total: 1,
  page: 1,
  per_page: 50,
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
      job_id: 21,
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
