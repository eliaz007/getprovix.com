import { createBrowserClient } from "@supabase/ssr";

console.log(
  "Supabase Client initialized with URL:",
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
