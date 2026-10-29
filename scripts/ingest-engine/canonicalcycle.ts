import fs from "node:fs";
import path from "node:path";
import { cycle } from "./cycle";

export function canonicalCycle(cycle: string[]): string {
