import fs from "node:fs";
import path from "node:path";
import { named } from "./named";
import { named } from "./named-82";
import { parts } from "./parts-83";

export   const parts = named[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part: (typeof parts)[number]) => /^type\s+/.test(part));
}
