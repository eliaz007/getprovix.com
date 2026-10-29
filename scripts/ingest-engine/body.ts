import fs from "node:fs";
import path from "node:path";
import { cycle } from "./cycle";

export   const body = cycle.slice(0, -1);
