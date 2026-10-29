import fs from "node:fs";
import path from "node:path";
import { toProjectPath } from "./toprojectpath";
import { lookupKnown } from "./lookupknown";
import { resolved } from "./resolved-139";
import { knownByLower } from "./knownbylower";

export     const resolved = lookupKnown(toProjectPath(candidate), knownByLower);
    if (resolved) return resolved;
  }

  return null;
}
