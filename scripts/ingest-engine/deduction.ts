import fs from "node:fs";
import path from "node:path";
import type { Severity } from "./severity";
import { SCORE_RULES } from "./score-rules";

export   const deduction = (Object.keys(SCORE_RULES) as Severity[]).reduce((sum, severity) => {
