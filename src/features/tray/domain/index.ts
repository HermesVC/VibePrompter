export interface TrayToggleConfig {
  id: 'enabled' | 'shortcuts' | 'boot' | 'clip';
  label: string;
  iconName: string;
  defaultValue: boolean;
  kbd?: string[];
}

export interface TrayMenuItem {
  id: string;
  label: string;
  iconName: string;
  kbd?: string[];
  accent?: boolean;
  danger?: boolean;
  badge?: string;
}
