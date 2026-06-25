// Minimal Markdown-ish renderer for assistant answers. The project ships no
// Markdown library and we won't add one, so this covers the subset the agent
// actually emits: paragraphs, bullet lists, **bold**, and `inline code`.
// Anything else renders as plain text with newlines preserved.

import { Fragment, type ReactNode } from 'react';

// Render a single line's inline spans: **bold** and `code`.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on bold or code while keeping the delimiters via capture groups.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-surface-card px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>);
    }
  });
  return nodes;
}

export function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    blocks.push(
      <ul key={key} className="my-1.5 list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList(`ul-${i}`);
    if (trimmed === '') {
      return;
    }
    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInline(line, `p-${i}`)}
      </p>
    );
  });
  flushList('ul-end');

  return <div className="space-y-2 text-sm text-body">{blocks}</div>;
}
