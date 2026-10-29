import fs from "node:fs";
import path from "node:path";
import { lines } from "./lines";
import { specifier } from "./specifier";
import { line } from "./line";
import { specifier } from "./specifier-48";
import { lines } from "./lines-64";
import { line } from "./line-119";
import { specifier } from "./specifier-133";
import { line } from "./line-134";

export type ImportStatement = {
  lines: string[];
  specifier: string;
  line: number;
};
