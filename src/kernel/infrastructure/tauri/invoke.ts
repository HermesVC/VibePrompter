import { invoke } from '@tauri-apps/api/core';

/** The sanitized error shape the Rust backend serializes `AppError` into. */
export interface SerializedAppError {
  code: string;
  message: string;
  retriable: boolean;
}

/** A typed error thrown when a Tauri command rejects. */
export class TauriError extends Error {
  readonly code: string;
  readonly retriable: boolean;

  constructor(err: SerializedAppError) {
    super(err.message);
    this.name = 'TauriError';
    this.code = err.code;
    this.retriable = err.retriable;
  }
}

function isSerializedAppError(value: unknown): value is SerializedAppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'retriable' in value
  );
}

/**
 * Typed wrapper over Tauri's `invoke`. Rejections carrying a serialized
 * `AppError` are normalized into a `TauriError`; anything else is rethrown
 * wrapped in a generic `TauriError` so callers always get one error type.
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    if (isSerializedAppError(raw)) {
      throw new TauriError(raw);
    }
    throw new TauriError({
      code: 'UNKNOWN_ERROR',
      message: raw instanceof Error ? raw.message : String(raw),
      retriable: false,
    });
  }
}
