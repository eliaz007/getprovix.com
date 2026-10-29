import fs from "node:fs";
import path from "node:path";
import { match } from "./match";
import { specifier } from "./specifier";
import { line } from "./line";
import { specifier } from "./specifier-48";
import { isPureTypeReexport } from "./ispuretypereexport";
import { match } from "./match-89";
import { line } from "./line-119";
import { source } from "./source";
import { edges } from "./edges";
import { specifier } from "./specifier-133";
import { edges } from "./edges-137";

export     const line = source.slice(0, match.index).split("\n").length;
    edges.push({
      specifier,
      line,
      typeOnly: isPureTypeReexport(match[0] ?? ""),
    });
  }

  return edges;
}
