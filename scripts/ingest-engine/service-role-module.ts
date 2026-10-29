import fs from "node:fs";
import path from "node:path";

export const SERVICE_ROLE_MODULE =
  /(?:^|\/)(?:service-role|serviceRole|supabase-admin|supabase\/admin)(?:\.tsx?)?$/;
