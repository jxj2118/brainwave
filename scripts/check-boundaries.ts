import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const root = resolve("src");
const failures: string[] = [];
function scan(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(file);
      continue;
    }
    if (!/\.tsx?$/.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const from = relative(root, file).split(sep).join("/");
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      const module = statement.moduleSpecifier;
      if (!module || !ts.isStringLiteral(module)) continue;
      const specifier = module.text;
      let reason = "";
      if (
        specifier.startsWith("@tauri-apps/") &&
        !from.startsWith("platform/native/")
      )
        reason = "Tauri imports belong in platform/native";
      if (specifier.startsWith(".")) {
        const target = relative(root, resolve(directory, specifier))
          .split(sep)
          .join("/");
        if (from.startsWith("shared/") && /^(app|features)\//.test(target))
          reason = "shared cannot depend on app/features";
        if (
          from.startsWith("shared/") &&
          target.startsWith("platform/") &&
          !(
            target === "platform/contracts" &&
            ts.isImportDeclaration(statement) &&
            statement.importClause?.isTypeOnly
          )
        )
          reason = "shared may only import platform contract types";
        if (from.startsWith("features/") && target.startsWith("app/"))
          reason = "features cannot depend on app";
        if (from.startsWith("platform/") && /^(app|features)\//.test(target))
          reason = "platform cannot depend on app/features";
      }
      if (reason) failures.push(`${from}: ${specifier}: ${reason}`);
    }
  }
}
scan(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("Architecture boundaries passed.");
