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
            parsed_ok: 18,
            parse_failed: 1,
            effective_recommendations: 8,
            interview_entries: 6,
            interview_passed: 3,
            interview_pass_rate: 50,
            offer_entries: 2,
            interview_to_offer_rate: 33.3,
            onboarded: 1,
            onboard_rate: 5,
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
