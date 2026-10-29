import fs from "node:fs";
import path from "node:path";
import { body } from "./body";

export   const addNamed = (body: string) => {
    for (const part of body.split(",")) {
