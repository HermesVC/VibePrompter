import { useCallback, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  autonomousRunStream,
  type AutonomousPhase,
  type AutonomousPlanSnapshot,
  type AutonomousRunResult,
} from '@shared/lib/autonomousRunApi';
import { buildChatContextPayload, type ChatContextState } from '@shared/lib/chatContext';
import { applyStreamPlanProgress } from '@shared/lib/planMemory';
import { errorMessage } from '@shared/lib/utils';

interface ChatStatusPayload {
  phase: string;
  generation?: number;
  attempt?: number;
  kind?: string;
  message?: string;
}

export interface AutonomousSendParams {
  streamId: string;
  goal: string;
  apiMessages: Array<{ role: string; content: string; images?: unknown[] }>;
  modeId: string | null;
  connectionId: string;
  chatContext: ChatContextState;
  sessionSummary: string;
  sessionId: string;
  onToken: (generation: number, delta: string) => void;
  onChatStatus: (payload: ChatStatusPayload) => void;
  onMemory: (payload: { sessionSummary?: string; contextWindowSize?: number }) => void;
  onComplete: (result: AutonomousRunResult) => void;
  onError: (message: string, cancelled: boolean) => void;
}

export function useAutonomousChatRun() {
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [plan, setPlan] = useState<AutonomousPlanSnapshot | null>(null);
  const [phase, setPhase] = useState<AutonomousPhase | null>(null);
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [streamPhaseDetail, setStreamPhaseDetail] = useState<string | null>(null);

  const clearAutonomousUi = useCallback(() => {
    setPlan(null);
    setPhase(null);
    setPhaseDetail(null);
    setStreamPhaseDetail(null);
  }, []);

  const syncPlanFromStream = useCallback((streamText: string) => {
    setPlan((prev) => {
      const updated = applyStreamPlanProgress(prev, streamText);
      if (!updated?.currentStepId) return updated ?? prev;
      const step = updated.steps.find((s) => s.id === updated.currentStepId);
      if (step) {
        setStreamPhaseDetail(`Step ${step.id}: ${step.title}`);
      }
      return updated;
    });
  }, []);

  const sendAutonomous = useCallback(async (params: AutonomousSendParams) => {
    const sid = params.streamId;
    const tokenEvent = `autonomous:${sid}:token`;
    const errEvent = `autonomous:${sid}:error`;
    const statusEvent = `autonomous:${sid}:status`;
    const memoryEvent = `autonomous:${sid}:memory`;
    const planEvent = `autonomous:${sid}:plan`;
    const phaseEvent = `autonomous:${sid}:phase`;

    setPhase('planning');
    setPhaseDetail(null);
    setStreamPhaseDetail(null);
    setPlan(null);

    const unlistens: Array<() => void> = [];
    try {
      const listeners = await Promise.all([
        listen<{ generation?: number; delta?: string }>(tokenEvent, (e) => {
          params.onToken(e.payload.generation ?? 0, e.payload.delta ?? '');
        }),
        listen<ChatStatusPayload>(statusEvent, (e) => {
          params.onChatStatus(e.payload);
        }),
        listen<{ sessionSummary?: string; contextWindowSize?: number }>(memoryEvent, (e) => {
          params.onMemory(e.payload);
        }),
        listen<AutonomousPlanSnapshot>(planEvent, (e) => {
          setPlan(e.payload);
          setStreamPhaseDetail(null);
          if (e.payload.currentStepId) {
            const step = e.payload.steps.find((s) => s.id === e.payload.currentStepId);
            if (step) {
              setPhaseDetail(`Step ${step.id}: ${step.title}`);
            }
          }
        }),
        listen<{ phase: AutonomousPhase; detail?: string | null }>(phaseEvent, (e) => {
          setPhase(e.payload.phase);
          if (e.payload.detail?.trim()) {
            setPhaseDetail(e.payload.detail.trim());
            setStreamPhaseDetail(null);
          }
        }),
        listen<string>(errEvent, (e) => {
          const cancelled = e.payload === 'cancelled';
          params.onError(e.payload, cancelled);
        }),
      ]);
      unlistens.push(...listeners);

      const result = await autonomousRunStream({
        streamId: sid,
        goal: params.goal,
        messages: params.apiMessages,
        modeId: params.modeId,
        connectionId: params.connectionId || undefined,
        chatContext: buildChatContextPayload(params.chatContext),
        sessionSummary: params.sessionSummary.trim() || undefined,
        sessionId: params.sessionId,
        config: {
          maxSteps: 12,
          maxReplans: 2,
          planningEnabled: true,
          verifySteps: true,
        },
      });

      setPhase(result.phase);
      setStreamPhaseDetail(null);
      if (result.plan?.steps?.length) {
        const done = result.plan.steps.filter(
          (s) => s.status === 'done' || s.status === 'skipped'
        ).length;
        const currentStepId =
          result.plan.steps.find((s) => s.status === 'in_progress')?.id ??
          result.plan.steps.find((s) => s.status === 'pending')?.id ??
          null;
        setPlan({
          progress: `${done}/${result.plan.steps.length}`,
          currentStepId,
          steps: result.plan.steps,
        });
      }
      params.onComplete(result);
    } catch (e) {
      const msg = errorMessage(e);
      params.onError(msg, msg.toLowerCase().includes('cancelled'));
      setPhase('failed');
    } finally {
      unlistens.forEach((u) => u());
    }
  }, []);

  const displayPhaseDetail = streamPhaseDetail ?? phaseDetail;

  return {
    autonomousMode,
    setAutonomousMode,
    plan,
    phase,
    phaseDetail: displayPhaseDetail,
    sendAutonomous,
    syncPlanFromStream,
    clearAutonomousUi,
  };
}
