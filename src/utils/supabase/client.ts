import { supabase } from "@/lib/supabaseClient";

export function createClient() {
  return supabase;
}

export function createClientComponentClient() {
  return supabase;
}

export { supabase };
