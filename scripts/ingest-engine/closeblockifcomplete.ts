import fs from "node:fs";
import path from "node:path";
import { block } from "./block";

export   const closeBlockIfComplete = () => {
    if (!block) return;
