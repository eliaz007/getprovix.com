import fs from "node:fs";
import path from "node:path";
import { start } from "./start";
import { body } from "./body";
import { start } from "./start-143";
import { start } from "./start-152";

export   const rotated = body.slice(start).concat(body.slice(0, start));
  return [...rotated, rotated[0] ?? ""].join(" -> ");
}
