/** Titled grouping with an optional hint, used to separate built-in vs. user modes. */
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="m-0 text-[11px] uppercase tracking-[0.10em] text-fg-dim font-semibold">
          {title}
        </h3>
        {hint && <span className="text-[11.5px] text-fg-dim">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
