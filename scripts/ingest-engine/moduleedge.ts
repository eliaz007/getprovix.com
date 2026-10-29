import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { line } from "./line-119";
import { edges } from "./edges";
import { line } from "./line-134";
import { graph } from "./graph";
import { edges } from "./edges-137";
import { graph } from "./graph-178";

export type ModuleEdge = {
  to: string;
  line: number;
  /** Type-only edges stay in the orphan graph and are skipped for runtime cycles. */
  typeOnly: boolean;
};
