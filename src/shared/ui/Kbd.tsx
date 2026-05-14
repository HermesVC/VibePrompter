interface KbdProps {
  keys: string[];
  size?: 'sm' | 'md' | 'lg';
}

export function Kbd({ keys, size = 'md' }: KbdProps) {
  const sm = size === 'sm';
  const lg = size === 'lg';
  const minW = lg ? 'min-w-[24px]' : sm ? 'min-w-[16px]' : 'min-w-[18px]';
  const h = lg ? 'h-6' : sm ? 'h-4' : 'h-[18px]';
  const px = lg ? 'px-[7px]' : sm ? 'px-1' : 'px-[5px]';
  const fs = lg ? 'text-[11.5px]' : sm ? 'text-[10px]' : 'text-[10.5px]';

  return (
    <span className="inline-flex gap-0.5">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className={`inline-flex items-center justify-center ${minW} ${h} ${px} ${fs} rounded font-mono font-medium leading-none text-fg-mute bg-surface-2 border-[0.5px] border-b border-border-strong`}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
