import { createBrowserSupabaseClient, supabase } from "@/lib/supabaseClient";

export function createClient() {
  return createBrowserSupabaseClient();
}

export function createClientComponentClient() {
  return createBrowserSupabaseClient();
}

export { supabase };
