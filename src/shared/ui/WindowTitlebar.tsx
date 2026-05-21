import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface WindowTitlebarProps {
  title?: string;
  icon?: ReactNode;
}

export function WindowTitlebar({ title = 'VibePrompter', icon }: WindowTitlebarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = safeWindow();
    if (!win) return;
    let unlisten: undefined | (() => void);
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  const onMin = () => safeWindow()?.minimize().catch(() => {});
  const onMax = () => safeWindow()?.toggleMaximize().catch(() => {});
  const onClose = () => safeWindow()?.close().catch(() => {});

  return (
    <div
      data-tauri-drag-region
      className="h-[34px] flex-shrink-0 pl-3.5 pr-0 flex items-center justify-between bg-bg-2 border-b-[0.5px] border-border-strong text-xs text-fg select-none"
      style={{ letterSpacing: '-0.005em' }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
        {icon}
        <span className="font-normal text-[11.5px] text-fg-strong">{title}</span>
      </div>
      <div data-tauri-drag-region className="flex-1 h-full" />
      <div className="flex h-full">
        <WinBtn onClick={onMin} aria-label="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </WinBtn>
        <WinBtn onClick={onMax} aria-label={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 3.5h5v5h-5z" stroke="currentColor" strokeWidth="1" />
              <path d="M3.5 3.5v-2h5v5h-2" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </WinBtn>
        <WinBtn onClick={onClose} aria-label="Close" danger>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </WinBtn>
      </div>
    </div>
  );
}

function safeWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

function WinBtn({
  children,
  onClick,
  danger,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[46px] h-full border-0 p-0 bg-transparent text-fg-mute flex items-center justify-center cursor-pointer transition-colors duration-75 ${
        danger
          ? 'hover:bg-[#e81123] hover:text-white active:bg-[#e81123]/80 active:text-white'
          : 'hover:bg-surface-3 active:bg-surface-3/60'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
