import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import { rawContent } from "./rawcontent";

export type ReportFile = Omit<IngestedFile, "rawContent">;
