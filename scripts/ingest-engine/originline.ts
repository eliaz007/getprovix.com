import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { violations } from "./violations";
import { line } from "./line-119";
import { line } from "./line-134";
import { graph } from "./graph";
import { violations } from "./violations-146";
import { visiting } from "./visiting";
import { visited } from "./visited";
import { stack } from "./stack";
import { dfs } from "./dfs";
import { description } from "./description";
import { origin } from "./origin";
import { next } from "./next";
import { rule } from "./rule";
import { graph } from "./graph-178";
import { violations } from "./violations-179";
import { filePath } from "./filepath";
import { violations } from "./violations-192";

export       const originLine = (graph.get(origin) ?? []).find((item) => item.to === next)?.line ?? edge.line;
      violations.push({
        filePath: origin,
        severity: "HIGH",
        rule: "Circular Dependency",
        line: originLine,
        message: `Circular import: ${description}`,
      });
    }

    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of [...graph.keys()].sort()) {
    if (!visited.has(node)) dfs(node);
  }

  return violations;
}
