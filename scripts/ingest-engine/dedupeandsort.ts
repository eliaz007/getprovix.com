import fs from "node:fs";
import path from "node:path";
import type { Violation } from "./violation";
import { violations } from "./violations";
import { violations } from "./violations-146";
import { violations } from "./violations-179";
import { violations } from "./violations-192";

export function dedupeAndSort(violations: Violation[]): Violation[] {
