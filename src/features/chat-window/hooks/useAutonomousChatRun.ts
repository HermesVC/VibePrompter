import { useCallback, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  autonomousRunStream,
  type AutonomousPhase,
  type AutonomousPlanSnapshot,
  type AutonomousRunResult,
} from '@shared/lib/autonomousRunApi';
import { buildChatContextPayload, type ChatContextState } from '@shared/lib/chatContext';
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

  const clearAutonomousUi = useCallback(() => {
    setPlan(null);
    setPhase(null);
    setPhaseDetail(null);
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
        }),
        listen<{ phase: AutonomousPhase; detail?: string | null }>(phaseEvent, (e) => {
          setPhase(e.payload.phase);
          setPhaseDetail(e.payload.detail?.trim() || null);
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
      if (result.plan?.steps?.length) {
        setPlan({ progress: '', steps: result.plan.steps });
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

  return {
    autonomousMode,
    setAutonomousMode,
    plan,
    phase,
    phaseDetail,
    sendAutonomous,
    clearAutonomousUi,
  };
}
