import fs from "node:fs";
import path from "node:path";
import { block } from "./block";
import { closeBlockIfComplete } from "./closeblockifcomplete";
import { line } from "./line";
import { line } from "./line-119";
import { line } from "./line-134";

export     const lineNumber = index + 1;

    if (block) {
      block.push(line);
      closeBlockIfComplete();
      continue;
    }
