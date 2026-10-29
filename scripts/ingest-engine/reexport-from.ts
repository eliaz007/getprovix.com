import fs from "node:fs";
import path from "node:path";

export const REEXPORT_FROM =
  /\bexport\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g;
