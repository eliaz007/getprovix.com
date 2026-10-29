import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { text } from "./text";
import { line } from "./line-119";
import { line } from "./line-134";

export function executableLines(content: string): Array<{ text: string; line: number }> {
