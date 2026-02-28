/**
 * Database configuration constants.
 * Centralized in shared/constants — no magic strings.
 */

export const DATABASE_CONFIG = {
  CONNECTION_URI: 'mongodb://localhost:27017',
  DATABASE_NAME: 'development',
  COLLECTIONS: {
    DOCUMENTS: 'documents'
  }
} as const
