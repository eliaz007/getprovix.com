import fs from "node:fs";
import path from "node:path";
import { name } from "./name";

export function isUnsafeEnvName(name: string): boolean {
  if (!name.startsWith("NEXT_PUBLIC_")) return true;
  return /SERVICE_ROLE|SECRET|PRIVATE_KEY/.test(name);
}
