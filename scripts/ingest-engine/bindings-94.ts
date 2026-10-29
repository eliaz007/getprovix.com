import fs from "node:fs";
import path from "node:path";
import { importedBindings } from "./importedbindings";
import { bindings } from "./bindings";

export   const bindings = importedBindings(statement);
