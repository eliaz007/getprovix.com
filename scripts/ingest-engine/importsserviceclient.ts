import fs from "node:fs";
import path from "node:path";
import { SERVICE_CLIENT_NAME } from "./service-client-name";
import { SERVICE_ROLE_MODULE } from "./service-role-module";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { bindings } from "./bindings";
import { bindings } from "./bindings-94";
import { specifier } from "./specifier-133";
import { imported } from "./imported";

export   const importsServiceClient = bindings.some(
    (binding) => SERVICE_CLIENT_NAME.test(binding.imported) || SERVICE_CLIENT_NAME.test(binding.local)
  );
  if (importsServiceClient) return true;
  if (SERVICE_ROLE_MODULE.test(specifier) && bindings.length > 0) return true;

  if (specifier !== "@supabase/supabase-js") return false;
  return bindings.some((binding: (typeof bindings)[number]) => binding.imported === "createClient" || binding.imported === "*");
}
