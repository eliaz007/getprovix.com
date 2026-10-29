import fs from "node:fs";
import path from "node:path";
import { text } from "./text";
import { match } from "./match-89";

export   const match = text.match(/\bfrom\s+['"]([^'"]+)['"]/);
  return match?.[1] ?? null;
}
