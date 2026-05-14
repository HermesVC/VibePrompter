import { TrayMenu } from '../ui/TrayMenu';

export function TrayPage() {
  return (
    <div
      className="ph-root min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          'radial-gradient(60% 50% at 50% 30%, rgba(167,139,250,0.06), transparent), var(--bg)',
      }}
    >
      <TrayMenu />
    </div>
  );
}
