// PromptHelper — icon set
// Stroke-based, 1.6-1.8 stroke-width, currentColor. 16x16 default viewBox.
// Inline SVG everywhere; no icon font.

const Icon = ({ d, size = 16, sw = 1.7, fill = 'none', viewBox = '0 0 16 16', style }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill}
    stroke={fill === 'none' ? 'currentColor' : 'none'} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

const I = {
  // navigation
  search:    (p) => <Icon {...p} d="M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm4-1.5 3 3" />,
  chevR:     (p) => <Icon {...p} d="M6 3l5 5-5 5" />,
  chevL:     (p) => <Icon {...p} d="M10 3 5 8l5 5" />,
  chevD:     (p) => <Icon {...p} d="M3 6l5 5 5-5" />,
  chevU:     (p) => <Icon {...p} d="M3 10l5-5 5 5" />,
  enter:     (p) => <Icon {...p} d="M13 4v3.5a2.5 2.5 0 0 1-2.5 2.5H3m0 0 2.5-2.5M3 10l2.5 2.5" />,
  close:     (p) => <Icon {...p} d="M3.5 3.5l9 9m0-9-9 9" />,
  plus:      (p) => <Icon {...p} d="M8 3v10M3 8h10" />,
  minus:     (p) => <Icon {...p} d="M3 8h10" />,
  check:     (p) => <Icon {...p} d="M3 8.5 6.5 12 13 4.5" />,
  more:      (p) => <Icon {...p} d={<>
    <circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none" />
  </>} />,
  drag:      (p) => <Icon {...p} d={<>
    {[3,8,13].map((y) => <React.Fragment key={y}>
      <circle cx="5.5" cy={y} r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy={y} r="1" fill="currentColor" stroke="none" />
    </React.Fragment>)}
  </>} />,

  // actions
  wand:      (p) => <Icon {...p} d="M11 2.5 11.5 4l1.5.5L11.5 5 11 6.5 10.5 5 9 4.5 10.5 4 11 2.5ZM3 13l7-7 2 2-7 7Z" />,
  sparkles:  (p) => <Icon {...p} d={<>
    <path d="M6 2.5 6.8 5l2.5.8L6.8 6.7 6 9.2l-.8-2.5L2.7 5.8 5.2 5 6 2.5Z" />
    <path d="M11.5 8.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" />
  </>} />,
  pen:       (p) => <Icon {...p} d="M2.5 13.5l1-3 7-7 2 2-7 7-3 1ZM10 3.5l2 2" />,
  text:      (p) => <Icon {...p} d="M3 4h10M5 4v9M11 4v9M5 13h2M9 13h2" />,
  shorten:   (p) => <Icon {...p} d="M3 5h10M3 8h7M3 11h10" />,
  expand:    (p) => <Icon {...p} d="M3 5h10M3 8h10M3 11h10" />,
  translate: (p) => <Icon {...p} d={<>
    <path d="M2 4h6M5 3v1.5M3 5c0 2 2 4 5 4M7 5c0 2-2 4-5 4" />
    <path d="M9 14l2-5 2 5M9.7 12.5h2.6" />
  </>} />,
  summarize: (p) => <Icon {...p} d="M3 4h10M3 7h10M3 10h6M3 13h4" />,
  explain:   (p) => <Icon {...p} d={<>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M6.5 6.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1.2-1.5 2.2M8 11v.01" />
  </>} />,
  mail:      (p) => <Icon {...p} d={<>
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="M2.5 4.5l5.5 4 5.5-4" />
  </>} />,
  code:      (p) => <Icon {...p} d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9.5 3l-3 10" />,
  commit:    (p) => <Icon {...p} d={<>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M2 8h3.5M10.5 8H14" />
  </>} />,
  formal:    (p) => <Icon {...p} d={<>
    <path d="M3 13V6l5-3 5 3v7" />
    <path d="M6 13V9.5h4V13" />
  </>} />,
  friendly:  (p) => <Icon {...p} d={<>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M6 9.5s.7 1.5 2 1.5 2-1.5 2-1.5M6 7v.01M10 7v.01" />
  </>} />,

  // app
  bolt:      (p) => <Icon {...p} d="M9 2 4 9h3l-1 5 5-7H8l1-5Z" />,
  cog:       (p) => <Icon {...p} d={<>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5v1.7M8 12.8v1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M1.5 8h1.7M12.8 8h1.7M3.4 12.6l1.2-1.2M11.4 4.6l1.2-1.2" />
  </>} />,
  keyboard:  (p) => <Icon {...p} d={<>
    <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
    <path d="M4 7v.01M7 7v.01M10 7v.01M13 7v.01M4 10h8" />
  </>} />,
  user:      (p) => <Icon {...p} d={<>
    <circle cx="8" cy="6" r="2.5" />
    <path d="M3 13.5c.5-2.5 2.5-3.5 5-3.5s4.5 1 5 3.5" />
  </>} />,
  cloud:     (p) => <Icon {...p} d="M4.5 12a3 3 0 0 1-.4-5.97A4 4 0 0 1 12 6.5a2.5 2.5 0 0 1 0 5H4.5Z" />,
  paint:     (p) => <Icon {...p} d={<>
    <path d="M2.5 8a5.5 5.5 0 1 1 11 0c0 1.5-1.2 2-2.5 2H9.5c-.5 0-1 .4-1 1s.5.7.5 1.5c0 .8-.6 1.5-1.5 1.5A5.5 5.5 0 0 1 2.5 8Z" />
    <circle cx="5" cy="7" r=".5" fill="currentColor" stroke="none" />
    <circle cx="8" cy="5" r=".5" fill="currentColor" stroke="none" />
    <circle cx="11" cy="7" r=".5" fill="currentColor" stroke="none" />
  </>} />,
  history:   (p) => <Icon {...p} d={<>
    <path d="M2 8a6 6 0 1 1 1.5 4M2 12V8.5h3.5" />
    <path d="M8 5v3.5l2 1.5" />
  </>} />,
  list:      (p) => <Icon {...p} d="M3 4h10M3 8h10M3 12h10" />,
  layers:    (p) => <Icon {...p} d="M8 2 2 5l6 3 6-3-6-3ZM2 8l6 3 6-3M2 11l6 3 6-3" />,
  info:      (p) => <Icon {...p} d={<>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 11V7.5M8 5v.01" />
  </>} />,
  eye:       (p) => <Icon {...p} d={<>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="1.7" />
  </>} />,
  eyeOff:    (p) => <Icon {...p} d="M3 3l10 10M6 5.4A8 8 0 0 1 8 5c4 0 6.5 3 6.5 3a13 13 0 0 1-2.2 2.6M9.6 9.6a1.7 1.7 0 0 1-2.2-2.2M1.5 8S4 4.5 8 4.5c.6 0 1.2.1 1.7.2" />,
  copy:      (p) => <Icon {...p} d={<>
    <rect x="5" y="5" width="8" height="8" rx="1.5" />
    <path d="M3 11V4.5C3 3.7 3.7 3 4.5 3H11" />
  </>} />,
  star:      (p) => <Icon {...p} d="M8 2 9.8 6l4.2.4-3.2 2.9.9 4.1L8 11.3 4.3 13.4l.9-4.1L2 6.4 6.2 6 8 2Z" />,
  trash:     (p) => <Icon {...p} d={<>
    <path d="M3 4.5h10M5 4.5V3.5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v1M4 4.5l.5 8.5c0 .6.4 1 1 1h5c.6 0 1-.4 1-1l.5-8.5" />
    <path d="M6.5 7v4M9.5 7v4" />
  </>} />,
  refresh:   (p) => <Icon {...p} d="M13.5 4v3h-3M2.5 12V9h3M3.5 6.5a5 5 0 0 1 8.5-1.5l1.5 1.5M12.5 9.5a5 5 0 0 1-8.5 1.5L2.5 9.5" />,
  power:     (p) => <Icon {...p} d="M8 2.5v5M4.5 4.5a5 5 0 1 0 7 0" />,
  bell:      (p) => <Icon {...p} d={<>
    <path d="M3.5 12h9l-1-1.5V8a3.5 3.5 0 0 0-7 0v2.5L3.5 12Z" />
    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
  </>} />,
  clipboard: (p) => <Icon {...p} d={<>
    <rect x="3.5" y="3.5" width="9" height="10" rx="1.5" />
    <path d="M6 3v-.5C6 2.2 6.2 2 6.5 2h3c.3 0 .5.2.5.5V3" />
  </>} />,
  cpu:       (p) => <Icon {...p} d={<>
    <rect x="4" y="4" width="8" height="8" rx="1" />
    <path d="M6 7h4v2H6zM2 6h2M2 10h2M12 6h2M12 10h2M6 2v2M10 2v2M6 12v2M10 12v2" />
  </>} />,
  gpu:       (p) => <Icon {...p} d={<>
    <rect x="2" y="5.5" width="12" height="6" rx="1" />
    <circle cx="6" cy="8.5" r="1.3" />
    <circle cx="10" cy="8.5" r="1.3" />
  </>} />,
  link:      (p) => <Icon {...p} d="M9 4.5h2A2.5 2.5 0 0 1 13.5 7v.5A2.5 2.5 0 0 1 11 10H9M7 11.5H5A2.5 2.5 0 0 1 2.5 9v-.5A2.5 2.5 0 0 1 5 6h2M6 8h4" />,
  download:  (p) => <Icon {...p} d="M8 2v8m-3-3 3 3 3-3M3 12.5h10" />,
  upload:    (p) => <Icon {...p} d="M8 13V5m-3 3 3-3 3 3M3 2.5h10" />,
  message:   (p) => <Icon {...p} d="M2.5 4.5C2.5 3.7 3.2 3 4 3h8c.8 0 1.5.7 1.5 1.5v5c0 .8-.7 1.5-1.5 1.5H6.5l-3 2.5v-2.5H4c-.8 0-1.5-.7-1.5-1.5v-5Z" />,
  arrowUp:   (p) => <Icon {...p} d="M8 13V3m-4 4 4-4 4 4" />,
  arrowR:    (p) => <Icon {...p} d="M3 8h10m-4-4 4 4-4 4" />,
  filter:    (p) => <Icon {...p} d="M2.5 4h11l-4 5v4l-3-1V9l-4-5Z" />,
  pin:       (p) => <Icon {...p} d="M8 2v4l2 2v2H6V8l2-2V2M8 10v4" />,
  pinOff:    (p) => <Icon {...p} d="M3 3l10 10M8 2v4l2 2v2H6V8l2-2V2" />,
};

// Provider glyphs (compact, monochrome — sit inside accent-tinted squares)
const ProviderGlyphs = {
  openai: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.3 9.8a5.5 5.5 0 0 0-.5-4.5 5.6 5.6 0 0 0-6-2.6A5.5 5.5 0 0 0 11.6 1a5.6 5.6 0 0 0-5.3 3.9 5.5 5.5 0 0 0-3.7 2.7 5.6 5.6 0 0 0 .7 6.6 5.5 5.5 0 0 0 .5 4.5 5.6 5.6 0 0 0 6 2.6A5.5 5.5 0 0 0 12.4 23a5.6 5.6 0 0 0 5.3-3.9 5.5 5.5 0 0 0 3.7-2.7 5.6 5.6 0 0 0-.7-6.6Zm-8.5 11.9a4.1 4.1 0 0 1-2.7-1l.1-.1 4.6-2.6a.7.7 0 0 0 .4-.7v-6.4l2 1.1v5.3a4.2 4.2 0 0 1-4.2 4.4ZM5 17.3a4.1 4.1 0 0 1-.5-2.8v-.1l4.6 2.7a.8.8 0 0 0 .8 0l5.6-3.2v2.3l-4.7 2.7a4.2 4.2 0 0 1-5.8-1.6ZM3.8 8.5a4.1 4.1 0 0 1 2.2-1.8V12a.7.7 0 0 0 .4.7l5.6 3.2-2 1.1-4.6-2.7a4.2 4.2 0 0 1-1.6-5.8ZM18.7 12 13 8.8l2-1.1 4.6 2.7a4.2 4.2 0 0 1-.7 7.5v-5.3a.8.8 0 0 0-.4-.6Zm2-3-.1.1L16 6.4a.8.8 0 0 0-.8 0L9.6 9.6V7.3l4.7-2.7a4.2 4.2 0 0 1 6.3 4.4ZM8.5 13.2 6.5 12V6.7a4.2 4.2 0 0 1 6.9-3.2l-.1.1L8.7 6.2a.7.7 0 0 0-.4.7Zm1-2.4L12 9.4l2.5 1.4v2.8L12 15l-2.5-1.4Z"/>
    </svg>
  ),
  anthropic: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.5 3h4.3l-7.5 18h-4.3l7.5-18ZM5.2 3 0 16h4.4l1-2.8h5l1 2.8h4.4L10.7 3H5.2Zm.7 7L7.3 6l1.4 4H5.9Z"/>
    </svg>
  ),
  gemini: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c0 4.6 5.4 10 10 10-4.6 0-10 5.4-10 10 0-4.6-5.4-10-10-10 4.6 0 10-5.4 10-10Z"/>
    </svg>
  ),
  ollama: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 13c0-4 3-7 7-7s7 3 7 7v5a2 2 0 0 1-2 2h-1v-3H8v3H7a2 2 0 0 1-2-2v-5Z"/>
      <circle cx="9.5" cy="12" r=".8" fill="currentColor"/>
      <circle cx="14.5" cy="12" r=".8" fill="currentColor"/>
    </svg>
  ),
};

Object.assign(window, { I, ProviderGlyphs });
