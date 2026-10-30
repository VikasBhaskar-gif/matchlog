export function LevelBar({
  level,
  xpIntoLevel,
  xpForNextLevel,
  progress,
  compact = false,
}: {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div className={compact ? "" : "w-full"}>
      <div className="flex items-baseline justify-between mb-1">
        <span className={compact ? "text-sm font-bold text-[var(--color-primary)]" : "text-2xl font-extrabold tracking-tight"}>
          LEVEL {level}
        </span>
        <span className="text-xs text-[var(--color-text-dim)]">
          {xpIntoLevel} / {xpForNextLevel} XP
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
