import fs from "node:fs";
import path from "node:path";
import { violations } from "./violations";
import { violations } from "./violations-146";
import { audit } from "./audit";
import { violations } from "./violations-179";
import { files } from "./files";
import { files } from "./files-191";

export   const violations = audit(files);
