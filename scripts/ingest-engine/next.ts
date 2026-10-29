import fs from "node:fs";
import path from "node:path";
import { cycleNodes } from "./cyclenodes";
import { origin } from "./origin";

export       const next = cycleNodes[1] ?? origin;
