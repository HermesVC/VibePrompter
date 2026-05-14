import type { ToastModel } from '../domain';

const TOASTS: ToastModel[] = [
  {
    id: '1',
    tone: 'progress',
    spinner: true,
    title: 'Generating response…',
    hint: 'Improving writing · 0.8s',
    kbd: ['Esc'],
  },
  {
    id: '2',
    tone: 'ok',
    iconName: 'check',
    title: 'Text improved successfully',
    hint: 'Copied to clipboard · 412ms',
    kbd: ['⌘', 'Z'],
  },
  {
    id: '3',
    tone: 'err',
    iconName: 'close',
    title: 'API request failed',
    hint: 'Rate limit exceeded — retry in 12s',
    action: 'Retry',
  },
];

export const toastsApi = {
  getDemoToasts: async (): Promise<ToastModel[]> => TOASTS,
};
