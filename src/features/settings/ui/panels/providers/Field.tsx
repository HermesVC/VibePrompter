/** Labeled form-field wrapper used throughout the connection editor. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] uppercase tracking-[0.10em] text-fg-dim font-semibold">
        {label}
      </span>
      {children}
    </div>
  );
}
