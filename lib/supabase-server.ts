import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
}

/**
 * Server-side Supabase client for API routes.
 * Uses SUPABASE_SERVICE_ROLE_KEY when set (bypasses RLS); otherwise anon key.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
