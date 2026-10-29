import fs from "node:fs";
import path from "node:path";
import { line } from "./line";
import { codePortion } from "./codeportion";
import { executable } from "./executable";
import { inBlock } from "./inblock";
import { text } from "./text";
import { end } from "./end";
import { start } from "./start";
import { line } from "./line-119";
import { line } from "./line-134";
import { start } from "./start-143";
import { start } from "./start-152";

export       const end = text.indexOf("*/", start + 2);
      if (end === -1) {
        text = text.slice(0, start);
        inBlock = true;
      } else {
        text = text.slice(0, start) + text.slice(end + 2);
      }
    }

    executable.push({ text: codePortion(text), line: index + 1 });
  }

  return executable;
}
