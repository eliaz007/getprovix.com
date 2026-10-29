import fs from "node:fs";
import path from "node:path";
import { inBlock } from "./inblock";
import { text } from "./text";
import { end } from "./end-70";

export       const end = text.indexOf("*/");
      if (end === -1) continue;
      text = text.slice(end + 2);
      inBlock = false;
    }
