import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User, AuthTokens } from '../../../domain/user';

/**
 * Auth state shape
 */
interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Initial auth state
 */
const initialState: AuthState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

/**
 * Auth slice - Manages authentication state
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Set loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },

    /**
     * Set auth error
     */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    /**
     * Login success - Set user and tokens
     */
    loginSuccess: (
      state,
      action: PayloadAction<{ user: User; tokens: AuthTokens }>
    ) => {
      state.user = action.payload.user;
      state.tokens = action.payload.tokens;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
    },

    /**
     * Update user data
     */
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },

    /**
     * Update tokens
     */
    setTokens: (state, action: PayloadAction<AuthTokens>) => {
      state.tokens = action.payload;
    },

    /**
     * Update access token only (after refresh)
     */
    updateAccessToken: (state, action: PayloadAction<string>) => {
      if (state.tokens) {
        state.tokens.accessToken = action.payload;
      }
    },

    /**
     * Logout - Clear all auth state
     */
    logout: (state) => {
      state.user = null;
      state.tokens = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.error = null;
    },

    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },
  },
});

/**
 * Export actions
 */
export const {
  setLoading,
  setError,
  loginSuccess,
  setUser,
  setTokens,
  updateAccessToken,
  logout,
  clearError,
} = authSlice.actions;

/**
 * Export reducer
 */
export const authReducer = authSlice.reducer;

/**
 * Selectors
 */
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectTokens = (state: { auth: AuthState }) => state.auth.tokens;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
export const selectAuthLoading = (state: { auth: AuthState }) => state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;
