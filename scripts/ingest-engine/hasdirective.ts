import fs from "node:fs";
import path from "node:path";
import { executableLines } from "./executablelines";
import { text } from "./text";

export function hasDirective(content: string, directive: "use client" | "use server"): boolean {
  return executableLines(content).some(({ text }) => {
