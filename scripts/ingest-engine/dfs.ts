import fs from "node:fs";
import path from "node:path";
import { graph } from "./graph";
import { visiting } from "./visiting";
import { visited } from "./visited";
import { stack } from "./stack";
import { graph } from "./graph-178";

export   const dfs = (node: string) => {
    visiting.add(node);
    stack.push(node);

    for (const edge of graph.get(node) ?? []) {
      if (edge.typeOnly) continue;
      if (!visiting.has(edge.to)) {
        if (!visited.has(edge.to)) dfs(edge.to);
        continue;
      }
