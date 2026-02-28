/**
 * Typed IPC contract for window operations.
 */

export const WindowChannels = {
  MINIMIZE: 'window:minimize',
  MAXIMIZE: 'window:maximize',
  CLOSE: 'window:close'
} as const

export interface WindowAPI {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
}
