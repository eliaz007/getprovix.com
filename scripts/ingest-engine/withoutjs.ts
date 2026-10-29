import fs from "node:fs";
import path from "node:path";
import { absoluteBase } from "./absolutebase";

export   const withoutJs = absoluteBase.replace(/\.js$/, "");
