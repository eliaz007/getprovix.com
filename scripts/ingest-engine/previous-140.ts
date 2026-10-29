import fs from "node:fs";
import path from "node:path";
import { specifier } from "./specifier";
import { line } from "./line";
import { specifier } from "./specifier-48";
import { entries } from "./entries";
import { rawContent } from "./rawcontent";
import { previous } from "./previous";
import { isPureTypeImport } from "./ispuretypeimport";
import { statementText } from "./statementtext";
import { line } from "./line-119";
import { resolved } from "./resolved";
import { reexportEdges } from "./reexportedges";
import { edges } from "./edges";
import { specifier } from "./specifier-133";
import { line } from "./line-134";
import { graph } from "./graph";
import { edges } from "./edges-137";
import { remember } from "./remember";
import { resolved } from "./resolved-139";
import { statementsByFile } from "./statementsbyfile";
import { graph } from "./graph-178";
import { filePath } from "./filepath";

export       const previous = edges.get(resolved);
      if (!previous) {
        edges.set(resolved, { line, typeOnly });
        return;
      }
      edges.set(resolved, {
        line: line < previous.line ? line : previous.line,
        typeOnly: previous.typeOnly && typeOnly,
      });
    };

    for (const statement of statementsByFile.get(file.filePath) ?? []) {
      remember(
        statement.specifier,
        statement.line,
        isPureTypeImport(statementText(statement))
      );
    }
    for (const edge of reexportEdges(file.rawContent)) {
      remember(edge.specifier, edge.line, edge.typeOnly);
    }

    graph.set(
      file.filePath,
      [...edges.entries()]
        .map(([to, edge]) => ({ to, line: edge.line, typeOnly: edge.typeOnly }))
        .sort((left, right) => left.to.localeCompare(right.to))
    );
  }

  return graph;
}
