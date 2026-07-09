import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { SourceQualityTable } from './SourceQualityTable';

describe('SourceQualityTable', () => {
  it('renders source quality metrics with interview and offer conversion wording', () => {
    render(
      <SourceQualityTable
        sources={[
          {
            channel: 'BOSS直聘',
            resumes: 20,
            parsedOk: 18,
            parseFailed: 1,
            effectiveRecommendations: 8,
            interviewEntries: 6,
            interviewPassed: 3,
            interviewPassRate: 50,
            offerEntries: 2,
            interviewToOfferRate: 33.3,
            onboarded: 1,
            onboardRate: 5,
          },
        ]}
      />
    );

    expect(screen.getByText('BOSS直聘')).toBeInTheDocument();
    expect(screen.getByText('推荐成功面试')).toBeInTheDocument();
    expect(screen.getByText('面试到 Offer')).toBeInTheDocument();
    expect(screen.getByText('33.3%')).toBeInTheDocument();
  });
});
