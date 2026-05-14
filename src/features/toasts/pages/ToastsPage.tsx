import { ToastStack } from '../ui/ToastStack';

export function ToastsPage() {
  return (
    <div
      className="ph-root min-h-screen relative"
      style={{
        background:
          'radial-gradient(60% 50% at 80% 80%, rgba(107,138,253,0.05), transparent), var(--bg)',
      }}
    >
      <div className="absolute bottom-6 right-6">
        <ToastStack />
      </div>
    </div>
  );
}
