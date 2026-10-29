import fs from "node:fs";
import path from "node:path";
import { start } from "./start";
import { body } from "./body";
import { start } from "./start-152";

export   let start = 0;
  for (let index = 1; index < body.length; index += 1) {
    if ((body[index] ?? "") < (body[start] ?? "")) start = index;
  }
