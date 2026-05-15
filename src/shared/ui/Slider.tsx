interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label?: string;
  disabled?: boolean;
}

/**
 * Custom-styled range slider.
 *
 * The visible track/fill/thumb is purely visual; an absolutely-positioned
 * `<input type="range">` provides the actual mouse and keyboard interaction.
 * Polished microinteractions live in `tokens.css` (`.ph-slider`):
 *   - thumb scales 1.18× on hover and shows an accent halo
 *   - thumb scales 0.92× on active for a tactile press
 *   - all motion is clamped by the global `prefers-reduced-motion` rule
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  label,
  disabled,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`ph-slider ${disabled ? 'ph-slider--disabled' : ''}`}>
      {label && (
        <div className="flex items-center mb-1.5">
          <span className="text-xs text-fg-mute flex-1">{label}</span>
          <span className="ph-mono text-xs text-fg">{format ? format(value) : value}</span>
        </div>
      )}
      <div className="ph-slider__group relative h-[18px] flex items-center">
        <div className="absolute left-0 right-0 h-[3px] rounded-[2px] bg-surface-3" />
        <div
          className="absolute left-0 h-[3px] rounded-[2px] bg-accent"
          style={{ width: `${pct}%` }}
        />
        <div
          className="ph-slider__thumb absolute w-[14px] h-[14px] rounded-full bg-fg-strong shadow-sm"
          style={{ left: `calc(${pct}% - 7px)`, border: '1.5px solid var(--accent)' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`absolute inset-0 opacity-0 w-full ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        />
      </div>
    </div>
  );
}
