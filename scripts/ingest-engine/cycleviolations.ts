import fs from "node:fs";
import path from "node:path";
import type { Violation } from "./violation";
import type { ModuleEdge } from "./moduleedge";
import { graph } from "./graph";
import { graph } from "./graph-178";

export function cycleViolations(graph: Map<string, ModuleEdge[]>): Violation[] {
