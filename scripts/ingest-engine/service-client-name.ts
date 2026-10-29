import fs from "node:fs";
import path from "node:path";

export const SERVICE_CLIENT_NAME =
  /^(createServiceRoleClient|supabaseAdmin|adminClient|serviceRoleClient)$/;
