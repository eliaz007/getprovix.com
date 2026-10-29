import fs from "node:fs";
import path from "node:path";
import { bindings } from "./bindings-94";
import { imported } from "./imported";

export   const bindings: Array<{ imported: string; local: string }> = [];
