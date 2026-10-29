import fs from "node:fs";
import path from "node:path";
import { absolutePath } from "./absolutepath";

export   const rawContent = fs.readFileSync(absolutePath, "utf8");
