/** Progress toward a target: grows into place once; the over-limit state is shown in the danger color. */
export default function ProgressBar({
  value,
  max = 100,
  label,
  tone
}: {
  value: number;
  max?: number;
  label: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0,
    over = max > 0 && value > max;
  return (
    <span
      className={'ds-progress ds-progress--' + (over ? 'danger' : tone || 'accent')}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(pct)}
    >
      <i style={{width: pct + '%'}} />
    </span>
  );
}
