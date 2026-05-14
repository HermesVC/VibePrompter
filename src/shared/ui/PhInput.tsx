import type { InputHTMLAttributes, ReactNode, CSSProperties } from 'react';
import { useState } from 'react';

interface PhInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  icon?: ReactNode;
  suffix?: ReactNode;
  mono?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
}

export function PhInput({
  icon,
  suffix,
  mono,
  size = 'md',
  style,
  value,
  onChange,
  ...rest
}: PhInputProps) {
  const [f, setF] = useState(false);
  const h = size === 'lg' ? 38 : size === 'sm' ? 26 : 32;

  return (
    <div
      className="flex items-center text-fg transition-[border-color,box-shadow] duration-100"
      style={{
        height: h,
        padding: `0 ${size === 'sm' ? 8 : 10}px`,
        background: 'var(--surface-2)',
        border: '.5px solid',
        borderColor: f ? 'var(--accent)' : 'var(--border-strong)',
        borderRadius: size === 'lg' ? 'var(--r-md)' : 6,
        boxShadow: f ? 'var(--accent-glow)' : 'none',
        gap: 8,
        ...style,
      }}
    >
      {icon && <span className="text-fg-mute flex">{icon}</span>}
      <input
        value={value}
        onChange={onChange}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-fg p-0"
        style={{
          fontFamily: mono ? 'var(--mono)' : 'inherit',
          fontSize: size === 'sm' ? 12 : 13,
        }}
        {...rest}
      />
      {suffix}
    </div>
  );
}
