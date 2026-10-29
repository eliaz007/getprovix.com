import fs from "node:fs";
import path from "node:path";
import { lines } from "./lines";
import { specifierIn } from "./specifierin";
import { statements } from "./statements";
import { block } from "./block";
import { blockStart } from "./blockstart";
import { specifier } from "./specifier";
import { line } from "./line";
import { lineNumber } from "./linenumber";
import { lines } from "./lines-64";
import { statements } from "./statements-101";
import { line } from "./line-119";
import { specifier } from "./specifier-133";
import { line } from "./line-134";

export       const specifier = specifierIn(line);
      if (specifier) statements.push({ lines: [line], specifier, line: lineNumber });
      continue;
    }

    block = [line];
    blockStart = lineNumber;
  }

  return statements;
}
