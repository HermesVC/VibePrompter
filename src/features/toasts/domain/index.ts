export type ToastTone = 'ok' | 'err' | 'progress';

export interface ToastModel {
  id: string;
  tone: ToastTone;
  iconName?: string;
  spinner?: boolean;
  title: string;
  hint?: string;
  kbd?: string[];
  action?: string;
}
