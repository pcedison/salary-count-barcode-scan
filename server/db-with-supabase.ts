// @ts-nocheck
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';

// Production strategy: PostgreSQL is the single supported runtime storage.
export const sql = postgres(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

export async function initializeDatabase() {
  if (process.env.USE_SUPABASE === 'true') {
    console.warn('USE_SUPABASE 已被忽略；系統目前固定使用 PostgreSQL 儲存');
  }

  process.env.USE_SUPABASE = 'false';

  return {
    useSupabase: false,
    storageMode: 'postgres_only'
  };
}

export function isUsingSupabase() {
  return false;
}

export function enableSupabase() {
  console.warn('Supabase 存儲切換已停用；系統維持 PostgreSQL-only 模式');
  process.env.USE_SUPABASE = 'false';
  return false;
}

export function disableSupabase() {
  process.env.USE_SUPABASE = 'false';
  return false;
}
