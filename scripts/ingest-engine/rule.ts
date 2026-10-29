import fs from "node:fs";
import path from "node:path";
import { SCORE_RULES } from "./score-rules";

export     const rule = SCORE_RULES[severity];
