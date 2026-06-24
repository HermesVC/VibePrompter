import type { AutonomousPhase, AutonomousPlanSnapshot, StepStatus } from '@shared/lib/autonomousRunApi';

interface AutonomousPlanStripProps {
  phase: AutonomousPhase | null;
  phaseDetail: string | null;
  plan: AutonomousPlanSnapshot | null;
}

const STATUS_MARK: Record<StepStatus, string> = {
  pending: '○',
  in_progress: '◉',
  done: '✓',
  failed: '✗',
  skipped: '–',
};

const PHASE_LABEL: Record<AutonomousPhase, string> = {
  planning: 'Планирование',
  executing: 'Выполнение',
  verifying: 'Проверка',
  replanning: 'Перепланирование',
  completing: 'Итог',
  done: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

export function AutonomousPlanStrip({ phase, phaseDetail, plan }: AutonomousPlanStripProps) {
  if (!phase && !plan) return null;

  return (
    <div
      style={{
        margin: '0 0 8px',
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      {phase && (
        <div style={{ marginBottom: plan ? 6 : 0, color: 'var(--fg-dim)' }}>
          <strong style={{ color: 'var(--fg)' }}>{PHASE_LABEL[phase]}</strong>
          {phaseDetail ? ` — ${phaseDetail}` : null}
          {plan?.progress ? ` (${plan.progress})` : null}
        </div>
      )}
      {plan && plan.steps.length > 0 && (
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            color: 'var(--fg-dim)',
          }}
        >
          {plan.steps.map((s) => (
            <li
              key={s.id}
              style={{
                color:
                  s.status === 'failed'
                    ? 'var(--danger)'
                    : s.status === 'done'
                      ? 'var(--fg-dim)'
                      : s.status === 'in_progress'
                        ? 'var(--fg)'
                        : 'var(--fg-dim)',
              }}
            >
              {STATUS_MARK[s.status]} {s.title}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
