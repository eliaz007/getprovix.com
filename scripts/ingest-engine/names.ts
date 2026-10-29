import fs from "node:fs";
import path from "node:path";
import { ENV_DOT } from "./env-dot";
import { ENV_BRACKET } from "./env-bracket";
import { match } from "./match";
import { text } from "./text";
import { match } from "./match-89";

export     const names = [
      ...entry.text.matchAll(ENV_DOT),
      ...entry.text.matchAll(ENV_BRACKET),
    ];

    for (const match of names) {
