import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

interface GlobalLoaderApi {
  show: (message?: string) => void;
  hide: () => void;
}

const GlobalLoaderContext = createContext<GlobalLoaderApi | null>(null);

export function useGlobalLoader(): GlobalLoaderApi {
  const ctx = useContext(GlobalLoaderContext);
  if (!ctx) {
    return {
      show: () => {},
      hide: () => {},
    };
  }
  return ctx;
}

export function GlobalLoaderProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Loading...');

  const show = (msg = 'Loading...') => {
    setMessage(msg);
    setLoading(true);
  };

  const hide = () => {
    setLoading(false);
  };

  const api = useMemo(() => ({ show, hide }), []);

  return (
    <GlobalLoaderContext.Provider value={api}>
      {children}
      {loading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'var(--glass)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          className="ph-anim-fade-in"
        >
          {/* Pulse Orb */}
          <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="flex items-center justify-center">
            <div style={{
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 9999,
              border: '1px solid var(--accent)',
              animation: 'pulse-ring 2s cubic-bezier(0.215, 0.610, 0.355, 1) infinite',
              opacity: 0.25,
            }}></div>
            <div style={{
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 9999,
              border: '1px solid var(--accent-2)',
              animation: 'pulse-ring 2s cubic-bezier(0.215, 0.610, 0.355, 1) infinite',
              animationDelay: '0.66s',
              opacity: 0.25,
            }}></div>
            <div style={{
              width: 60,
              height: 60,
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              animation: 'morph-orb 6s linear infinite',
              boxShadow: 'var(--accent-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: 'var(--sans)',
                fontWeight: 700,
                fontSize: 14,
                color: '#ffffff',
                letterSpacing: '-0.05em',
              }}>VP</span>
            </div>
          </div>
          <div
            style={{
              marginTop: 24,
              fontFamily: 'var(--sans)',
              fontWeight: 500,
              fontSize: 12,
              color: 'var(--fg-strong)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {message}
          </div>
        </div>
      )}
    </GlobalLoaderContext.Provider>
  );
}
