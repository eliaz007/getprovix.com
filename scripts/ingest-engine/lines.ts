import fs from "node:fs";
import path from "node:path";
import { lines } from "./lines-64";

export   const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}
