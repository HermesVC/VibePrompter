// Kernel Application Layer - Use cases and state management
// Business logic shared across features

// Redux Store
export { store, persistor, type RootState, type AppDispatch } from './store';
export { useAppDispatch, useAppSelector } from './store/hooks';

// Auth Slice
export {
  setLoading as setAuthLoading,
  setError as setAuthError,
  loginSuccess,
  setUser,
  setTokens,
  updateAccessToken,
  logout,
  clearError as clearAuthError,
  selectAuth,
  selectUser,
  selectTokens,
  selectIsAuthenticated,
  selectAuthLoading,
  selectAuthError,
} from './store/slices/auth.slice';

// UI Slice
export {
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  addToast,
  removeToast,
  clearToasts,
  openModal,
  closeModal,
  setGlobalLoading,
  selectUI,
  selectTheme,
  selectSidebarCollapsed,
  selectToasts,
  selectModals,
  selectGlobalLoading,
} from './store/slices/ui.slice';
