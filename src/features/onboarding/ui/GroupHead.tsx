export function GroupHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2.5">
      <div
        className="text-[13px] font-semibold text-fg-strong"
        style={{ letterSpacing: '-0.005em' }}
      >
        {title}
      </div>
      {hint && <div className="text-xs text-fg-mute mt-[3px]">{hint}</div>}
    </div>
  );
}
