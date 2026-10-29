import fs from "node:fs";
import path from "node:path";

export const SERVICE_KEY_TOKEN = /\b(SUPABASE_SERVICE_ROLE(?:_KEY)?|SERVICE_ROLE_KEY)\b/g;
