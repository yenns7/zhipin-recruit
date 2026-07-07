import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { StructuredJobResult } from './StructuredJobResult';

describe('StructuredJobResult', () => {
  it('renders known labels, tag arrays, and empty values defensively', () => {
    render(
      <StructuredJobResult
        structured={{
          education: '本科及以上',
          skills: ['React', 'TypeScript'],
          responsibilities: [],
          experience: '',
        }}
      />
    );

    expect(screen.getByText('学历要求')).toBeInTheDocument();
    expect(screen.getByText('本科及以上')).toBeInTheDocument();
    expect(screen.getByText('技能要求')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('工作经验')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
