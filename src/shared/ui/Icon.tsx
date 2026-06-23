import type { CSSProperties, ReactNode, SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'fill'> {
  size?: number;
  sw?: number;
  fill?: string;
  style?: CSSProperties;
}

const mk = (path: ReactNode, defaultSw = 1.5) =>
  function Icon({ size = 16, sw, fill = 'none', style, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke="currentColor"
        strokeWidth={sw ?? defaultSw}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block', flex: '0 0 auto', ...style }}
        {...rest}
      >
        {path}
      </svg>
    );
  };

// eslint-disable-next-line react-refresh/only-export-components
export const I = {
  search: mk(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  close: mk(<path d="M18 6 6 18M6 6l12 12" />),
  check: mk(<path d="M20 6 9 17l-5-5" />),
  chevD: mk(<path d="m6 9 6 6 6-6" />),
  chevR: mk(<path d="m9 6 6 6-6 6" />),
  chevL: mk(<path d="m15 18-6-6 6-6" />),
  arrowR: mk(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  plus: mk(<path d="M12 5v14M5 12h14" />),
  eye: mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: mk(<><path d="M9.88 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.1 17.1 0 0 1-3.2 4.1M6.6 6.6A17.7 17.7 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 5.4-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>),
  copy: mk(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>),
  star: mk(<path d="m12 17.3-6.2 3.7 1.7-7-5.5-4.7 7.2-.6L12 2l2.8 6.7 7.2.6-5.5 4.7 1.7 7Z" />),
  pen: mk(<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />),
  refresh: mk(<><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>),
  trash: mk(<><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>),
  cog: mk(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
  keyboard: mk(<><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 15h10" /></>),
  layers: mk(<><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></>),
  cloud: mk(<path d="M17.5 19a4.5 4.5 0 0 0 0-9 7 7 0 0 0-13.6 1.7A4 4 0 0 0 5 19h12.5Z" />),
  history: mk(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>),
  paint: mk(<path d="M12 22a8 8 0 0 1-8-8c0-4 4-8.5 8-12 4 3.5 8 8 8 12 0 2-1 4-2.5 4S15 17 13 17s-1 5-1 5Z" />),
  cpu: mk(<><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 14h3M20 9h3M20 14h3" /></>),
  info: mk(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>),
  bell: mk(<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></>),
  bolt: mk(<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />),
  wand: mk(<><path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" /><path d="m5 19 9-9" /><path d="m12.5 6.5 5 5" /></>),
  sparkles: mk(<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />),
  power: mk(<><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.7 0" /></>),
  clipboard: mk(<><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></>),
  download: mk(<><path d="M12 3v13" /><path d="m6 10 6 6 6-6" /><path d="M4 21h16" /></>),
  upload: mk(<><path d="M12 21V8" /><path d="m6 14 6-6 6 6" /><path d="M4 3h16" /></>),
  link: mk(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" /></>),
  list: mk(<path d="M3 6h18M3 12h18M3 18h18" />),
  filter: mk(<path d="M3 5h18l-7 9v6l-4-2v-4Z" />),
  pin: mk(<><path d="m17 3-4 4-4-2-5 5 8 8 5-5-2-4 4-4Z" /><path d="m9 15-6 6" /></>),
  more: mk(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  code: mk(<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />),
  mail: mk(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  text: mk(<><path d="M4 7V5h16v2" /><path d="M9 5v14M15 19h-6" /></>),
  summarize: mk(<path d="M4 6h16M4 12h10M4 18h7" />),
  shorten: mk(<><path d="M3 6h18M3 12h12M3 18h7" /><path d="m18 14 3 4-3 4" /></>),
  formal: mk(<path d="M5 21V3h14v18l-7-4Z" />),
  friendly: mk(<><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>),
  translate: mk(<><path d="M4 5h7M7.5 5v2c0 4-2 6-4 7M5 9c0 3 3 5 6 5" /><path d="M13 21l4-9 4 9M14.5 17.5h5" /></>),
  expand: mk(<path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" />),
  return: mk(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></>),
  image: mk(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 16-5.5-5.5a2 2 0 0 0-2.8 0L3 18" /></>),
  paperclip: mk(<path d="m16 6-8.5 8.5a3 3 0 1 0 4.2 4.2L20 10.5a5 5 0 0 0-7.1-7.1L4.5 11.8a7 7 0 1 0 9.9 9.9L20 10" />, 1.4),
};

export type IconName = keyof typeof I;

export function Spinner({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      className="ph-spin"
      style={{ display: 'block' }}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.5" opacity="0.95" />
    </svg>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const ProviderGlyphs = {
  openai: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M21.6 10.4a5.4 5.4 0 0 0-.5-4.5 5.5 5.5 0 0 0-5.9-2.6 5.4 5.4 0 0 0-4.2-1.9 5.5 5.5 0 0 0-5.3 3.9 5.5 5.5 0 0 0-3.7 2.7 5.5 5.5 0 0 0 .7 6.5 5.4 5.4 0 0 0 .5 4.5 5.5 5.5 0 0 0 5.9 2.6 5.4 5.4 0 0 0 4.2 1.9 5.5 5.5 0 0 0 5.3-3.9 5.5 5.5 0 0 0 3.7-2.7 5.5 5.5 0 0 0-.7-6.5ZM13 21a4 4 0 0 1-2.6-.9l5-2.9a.8.8 0 0 0 .4-.7v-7l2.1 1.3v5.9a4 4 0 0 1-4.9 4.3Zm-8.5-3.6a4 4 0 0 1-.5-2.7l.4.3 5 2.9a.8.8 0 0 0 .8 0l6-3.5v2.4l-5 2.9a4 4 0 0 1-6.7-2.3Zm-1.3-11A4 4 0 0 1 5.3 4.5v6.1a.8.8 0 0 0 .4.7l6 3.5-2.1 1.2-5-2.9a4 4 0 0 1-1.4-5.6Zm17.2 4-6-3.5 2-1.2 5 2.9a4 4 0 0 1-.6 7.2v-6.1a.8.8 0 0 0-.4-.7ZM20.4 6l-.4-.3-5-2.9a.8.8 0 0 0-.8 0L8.3 6.4V4l5-2.9a4 4 0 0 1 7 4.8Zm-13 5L9.5 9.5l2 1.3v2.3l-2 1.3-2.2-1.2Z" />
    </svg>
  ),
  anthropic: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M7.2 4 2 20h3l1.1-3.5h5.5L12.7 20h3L10.5 4H7.2Zm.5 9.5L9 9.5l1.3 4H7.7Z" />
      <path d="M16 4 21.2 20h-3.3L12.7 4H16Z" />
    </svg>
  ),
  gemini: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M12 2c0 5.5-4.5 10-10 10 5.5 0 10 4.5 10 10 0-5.5 4.5-10 10-10-5.5 0-10-4.5-10-10Z" />
    </svg>
  ),
  ollama: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M12 3c-3.5 0-6 3-6 7v5c0 2 1.5 4 3 5h6c1.5-1 3-3 3-5v-5c0-4-2.5-7-6-7Z" />
      <path d="M9 11c0 1 .4 1.8 1 2M15 11c0 1-.4 1.8-1 2" />
      <path d="M10 17h4" />
    </svg>
  ),
};
