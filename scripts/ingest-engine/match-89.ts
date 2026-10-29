import fs from "node:fs";
import path from "node:path";
import { match } from "./match";
import { trimmed } from "./trimmed";
import { trimmed } from "./trimmed-72";
import { bindings } from "./bindings";
import { trimmed } from "./trimmed-88";
import { bindings } from "./bindings-94";
import { imported } from "./imported";

export       const match = trimmed.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!match?.[1]) continue;
      bindings.push({ imported: match[1], local: match[2] ?? match[1] });
    }
  };
