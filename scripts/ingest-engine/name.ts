import fs from "node:fs";
import path from "node:path";
import { match } from "./match";
import { match } from "./match-89";
import { isUnsafeEnvName } from "./isunsafeenvname";

export       const name = match[1];
      if (!name || !isUnsafeEnvName(name)) continue;
