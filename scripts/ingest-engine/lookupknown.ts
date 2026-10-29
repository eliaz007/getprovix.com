import fs from "node:fs";
import path from "node:path";
import { knownByLower } from "./knownbylower";

export function lookupKnown(candidate: string, knownByLower: Map<string, string>): string | null {
  return knownByLower.get(candidate.toLowerCase()) ?? null;
}
