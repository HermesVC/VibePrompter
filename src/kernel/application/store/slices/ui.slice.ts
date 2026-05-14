import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Toast notification type
 */
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

/**
 * Modal configuration
 */
interface ModalConfig {
  id: string;
  isOpen: boolean;
  data?: unknown;
}

/**
 * UI state shape
 */
interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  toasts: Toast[];
  modals: Record<string, ModalConfig>;
  isLoading: boolean;
  loadingMessage: string | null;
}

/**
 * Initial UI state
 */
const initialState: UIState = {
  theme: 'system',
  sidebarCollapsed: false,
  toasts: [],
  modals: {},
  isLoading: false,
  loadingMessage: null,
};

/**
 * UI slice - Manages UI state
 */
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    /**
     * Set theme
     */
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
      state.theme = action.payload;
    },

    /**
     * Toggle sidebar
     */
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },

    /**
     * Set sidebar collapsed state
     */
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },

    /**
     * Add toast notification
     */
    addToast: (state, action: PayloadAction<Omit<Toast, 'id'>>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      state.toasts.push({ ...action.payload, id });
    },

    /**
     * Remove toast notification
     */
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },

    /**
     * Clear all toasts
     */
    clearToasts: (state) => {
      state.toasts = [];
    },

    /**
     * Open modal
     */
    openModal: (state, action: PayloadAction<{ id: string; data?: unknown }>) => {
      state.modals[action.payload.id] = {
        id: action.payload.id,
        isOpen: true,
        data: action.payload.data,
      };
    },

    /**
     * Close modal
     */
    closeModal: (state, action: PayloadAction<string>) => {
      if (state.modals[action.payload]) {
        state.modals[action.payload].isOpen = false;
      }
    },

    /**
     * Set global loading state
     */
    setGlobalLoading: (
      state,
      action: PayloadAction<{ isLoading: boolean; message?: string }>
    ) => {
      state.isLoading = action.payload.isLoading;
      state.loadingMessage = action.payload.message || null;
    },
  },
});

/**
 * Export actions
 */
export const {
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  addToast,
  removeToast,
  clearToasts,
  openModal,
  closeModal,
  setGlobalLoading,
} = uiSlice.actions;

/**
 * Export reducer
 */
export const uiReducer = uiSlice.reducer;

/**
 * Selectors
 */
export const selectUI = (state: { ui: UIState }) => state.ui;
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;
export const selectSidebarCollapsed = (state: { ui: UIState }) => state.ui.sidebarCollapsed;
export const selectToasts = (state: { ui: UIState }) => state.ui.toasts;
export const selectModals = (state: { ui: UIState }) => state.ui.modals;
export const selectGlobalLoading = (state: { ui: UIState }) => ({
  isLoading: state.ui.isLoading,
  message: state.ui.loadingMessage,
});
