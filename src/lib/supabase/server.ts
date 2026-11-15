import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getServerSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || null;
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(getServerSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Server-only Supabase admin client (never exposed to browser).
 * Useful for Supabase Storage uploads, Realtime broadcasts, or admin RPCs.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getServerSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
