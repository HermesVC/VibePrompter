import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import { authReducer } from './slices/auth.slice';
import { uiReducer } from './slices/ui.slice';

/**
 * Custom storage adapter for redux-persist
 * Uses the Web Storage API directly with proper error handling
 */
const storage = {
  getItem: (key: string): Promise<string | null> => {
    return Promise.resolve(window.localStorage.getItem(key));
  },
  setItem: (key: string, value: string): Promise<void> => {
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

/**
 * Root reducer combining all slice reducers
 */
const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
});

/**
 * Persist configuration
 */
const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  whitelist: ['auth'], // Only persist auth state
  blacklist: ['ui'], // Don't persist UI state
};

/**
 * Persisted root reducer
 */
const persistedReducer = persistReducer(persistConfig, rootReducer);

/**
 * Create Redux store with middleware
 */
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: import.meta.env.DEV,
});

/**
 * Create persistor for redux-persist
 */
export const persistor = persistStore(store);

/**
 * Root state type
 */
export type RootState = ReturnType<typeof store.getState>;

/**
 * App dispatch type
 */
export type AppDispatch = typeof store.dispatch;
