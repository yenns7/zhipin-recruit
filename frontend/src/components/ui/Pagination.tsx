import { cn } from '../../lib/cn';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  summary?: string;
  className?: string;
}

function buildPages(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push('ellipsis');
  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);

  return pages;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  summary,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPages(page, totalPages);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3',
        className,
      )}
    >
      {summary ? (
        <span className="text-xs text-muted">{summary}</span>
      ) : (
        <span />
      )}
      <nav className="flex items-center gap-1.5" aria-label="分页导航">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="上一页"
        >
          上一页
        </Button>
        {pages.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="select-none px-1.5 text-xs text-muted-soft"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'accent' : 'secondary'}
              size="sm"
              onClick={() => onChange(item)}
              aria-label={`第 ${item} 页`}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="下一页"
        >
          下一页
        </Button>
      </nav>
    </div>
  );
}
