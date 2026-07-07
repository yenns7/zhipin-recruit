import { Reveal } from '../motion';

export function safeNum(value: number | undefined): number {
  const normalized = value ?? 0;
  return Number.isFinite(normalized) ? normalized : 0;
}

export function pct(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return normalized.toFixed(1) + '%';
}

export function safeRate(numerator: number, denominator: number): number {
  const normalizedNumerator = safeNum(numerator);
  const normalizedDenominator = safeNum(denominator);
  if (normalizedDenominator <= 0) return 0;
  return Math.round((normalizedNumerator / normalizedDenominator) * 1000) / 10;
}

export function InlineBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong"
        style={{ minWidth: 40 }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-apple"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}dd, ${color})` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-body">{value}</span>
    </div>
  );
}

export { Reveal };
