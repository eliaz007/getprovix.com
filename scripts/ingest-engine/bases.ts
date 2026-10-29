import fs from "node:fs";
import path from "node:path";
import { absoluteBase } from "./absolutebase";
import { withoutJs } from "./withoutjs";

export   const bases = withoutJs === absoluteBase ? [absoluteBase] : [absoluteBase, withoutJs];
