import fs from "node:fs";
import path from "node:path";
import { base } from "./base-162";
import { filePath } from "./filepath";

export   const base = filePath.split("/").pop() ?? filePath;
  return (
    filePath.split("/").includes("__tests__") ||
    base.endsWith(".test.ts") ||
    base.endsWith(".test.tsx") ||
    base.endsWith(".spec.ts")
  );
}
