import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./projectroot";
import { specifier } from "./specifier";
import { specifier } from "./specifier-48";
import { specifier } from "./specifier-133";

export   let absoluteBase: string;
  if (specifier.startsWith("@/")) {
    absoluteBase = path.join(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    absoluteBase = path.resolve(projectRoot, path.dirname(fromFile), specifier);
  } else {
    return null;
  }
