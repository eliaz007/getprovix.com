import fs from "node:fs";
import path from "node:path";
import { match } from "./match";
import { bindings } from "./bindings";
import { addNamed } from "./addnamed";
import { match } from "./match-89";
import { withNamed } from "./withnamed";
import { namedOnly } from "./namedonly";
import { bindings } from "./bindings-94";
import { imported } from "./imported";

export   const defaultOnly = statement.match(/^\s*import\s+(?!type\b)(\w+)\s+from\b/);

  if (withNamed?.[1] && withNamed[2] !== undefined) {
    bindings.push({ imported: withNamed[1], local: withNamed[1] });
    addNamed(withNamed[2]);
  } else if (namedOnly?.[1]) {
    addNamed(namedOnly[1]);
  } else if (defaultOnly?.[1]) {
    bindings.push({ imported: defaultOnly[1], local: defaultOnly[1] });
  }

  return bindings;
}
