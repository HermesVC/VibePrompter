import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { I, NavItem, PhInput, PhWindow, type IconName } from '@shared/ui';
import { useTabsQuery } from '../application/settings.query';
import type { SettingsTabId } from '../domain';

export function SettingsWindow() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: tabs = [] } = useTabsQuery();

  const tab: SettingsTabId = useMemo(() => {
    const segment = pathname.split('/').pop() ?? '';
    return (tabs.find((t) => t.id === segment)?.id ?? 'general') as SettingsTabId;
  }, [tabs, pathname]);

  return (
    <div
      className="ph-root min-h-screen p-6 flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div style={{ width: 1040, height: 760, maxWidth: '100%' }}>
        <PhWindow title="PromptHelper · Settings" icon={<span className="ph-mark sm" />}>
          <div className="flex flex-1 min-h-0 bg-bg" style={{ height: 'calc(100% - 36px)' }}>
            <aside
              className="w-[220px] flex-shrink-0 p-2.5 flex flex-col gap-2.5"
              style={{ borderRight: '.5px solid var(--border)', background: 'var(--bg-2)' }}
            >
              <div className="px-2 pt-1 pb-1.5">
                <PhInput size="sm" icon={<I.search size={12} />} placeholder="Search settings…" />
              </div>
              <nav className="flex flex-col gap-px">
                {tabs.map((n) => {
                  const Icon = I[n.iconName as IconName];
                  return (
                    <NavItem
                      key={n.id}
                      icon={Icon ? <Icon size={14} /> : null}
                      label={n.label}
                      active={tab === n.id}
                      onClick={() => navigate(`/settings/${n.id}`)}
                    />
                  );
                })}
              </nav>
              <div className="mt-auto px-2.5 py-2 text-[11px] text-fg-dim">
                <div className="ph-mono">v1.2.0 · build 4421</div>
              </div>
            </aside>
            <main className="flex-1 min-w-0 overflow-auto" style={{ padding: '20px 28px 28px' }}>
              <Outlet />
            </main>
          </div>
        </PhWindow>
      </div>
    </div>
  );
}

