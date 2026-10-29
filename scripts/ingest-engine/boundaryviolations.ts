import fs from "node:fs";
import path from "node:path";
import type { IngestedFile } from "./ingestedfile";
import type { Violation } from "./violation";
import { isClientBoundary } from "./isclientboundary";

export function boundaryViolations(file: IngestedFile): Violation[] {
  if (!isClientBoundary(file)) return [];
