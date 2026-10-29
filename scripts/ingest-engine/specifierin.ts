import fs from "node:fs";
import path from "node:path";
import { text } from "./text";

export function specifierIn(text: string): string | null {
