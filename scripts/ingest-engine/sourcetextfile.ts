import fs from "node:fs";
import path from "node:path";
import { filePath } from "./filepath";

export type SourceTextFile = {
  filePath: string;
  content: string;
};
