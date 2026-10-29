import fs from "node:fs";
import path from "node:path";
import { filePath } from "./filepath";

export function isTestModule(filePath: string): boolean {
