import fs from "node:fs";
import path from "node:path";
import { next } from "./next";

export const IGNORED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist"]);
