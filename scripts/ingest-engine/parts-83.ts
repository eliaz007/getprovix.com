import fs from "node:fs";
import path from "node:path";
import { named } from "./named";
import { parts } from "./parts";
import { named } from "./named-82";

export   const parts = named[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part: (typeof parts)[number]) => /^type\s+/.test(part));
}
