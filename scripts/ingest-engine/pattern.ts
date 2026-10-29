import fs from "node:fs";
import path from "node:path";
import { REEXPORT_FROM } from "./reexport-from";
import { match } from "./match";
import { match } from "./match-89";
import { source } from "./source";

export   const pattern = new RegExp(REEXPORT_FROM.source, "g");

  for (const match of source.matchAll(pattern)) {
