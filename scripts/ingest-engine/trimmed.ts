import fs from "node:fs";
import path from "node:path";
import { lineHasFromClause } from "./linehasfromclause";
import { isSideEffectImport } from "./issideeffectimport";
import { startsImportStatement } from "./startsimportstatement";
import { isCommentLine } from "./iscommentline";
import { line } from "./line";
import { trimmed } from "./trimmed-72";
import { trimmed } from "./trimmed-88";
import { line } from "./line-119";
import { line } from "./line-134";

export     const trimmed = line.trim();
    if (isCommentLine(trimmed) || !startsImportStatement(trimmed)) continue;
    if (isSideEffectImport(trimmed)) continue;

    if (lineHasFromClause(line)) {
