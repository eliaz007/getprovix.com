import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { inSingle } from "./insingle";
import { inDouble } from "./indouble";
import { inTemplate } from "./intemplate";
import { char } from "./char";
import { line } from "./line-119";
import { line } from "./line-134";
import { previous } from "./previous-140";

export     const previous = index > 0 ? line[index - 1] : "";
    if (char === "'" && !inDouble && !inTemplate && previous !== "\\") inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inTemplate && previous !== "\\") inDouble = !inDouble;
    else if (char === "`" && !inSingle && !inDouble && previous !== "\\") inTemplate = !inTemplate;
    else if (char === "/" && line[index + 1] === "/" && !inSingle && !inDouble && !inTemplate) {
      return line.slice(0, index);
    }
  }

  return line;
}
