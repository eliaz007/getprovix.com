import fs from "node:fs";
import path from "node:path";
import { block } from "./block";
import { line } from "./line";
import { codePortion } from "./codeportion";
import { line } from "./line-119";
import { line } from "./line-134";

export   const noBlock = content.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return noBlock
    .split(/\r?\n/)
    .map((line) => codePortion(line))
    .join("\n");
}
