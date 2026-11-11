import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const authConfigured = Boolean(url && key);

let client: Promise<SupabaseClient> | null = null;

/** Loads the auth SDK on first use, so visitors who never sign in don't download it. */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!authConfigured) return null;
  client ??= import('@supabase/supabase-js').then((m) => m.createClient(url!, key!));
  return client;
}
