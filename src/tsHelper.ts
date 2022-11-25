import * as path from 'path'
import * as fs from 'fs'
import * as ts from 'typescript'

export function normalizeTsconfigPath(tsconfigPath: string): string {
  return path.resolve(tsconfigPath);
}

/**
 * Given a file, return the list of files it imports as absolute paths.
 */
export function getImportsForFile(typescriptFilePath: string, srcRoot: string, config: ts.ParsedCommandLine): string[] {
  // Follow symlink so directory check works.
  typescriptFilePath = fs.realpathSync(typescriptFilePath)
  const fileContent = fs.readFileSync(typescriptFilePath).toString();
  const fileInfo = ts.preProcessFile(fileContent);
  return fileInfo.importedFiles
    .map(importedFile => importedFile.fileName)
    // remove svg, css imports
    .filter(fileName => !fileName.endsWith(".css") && !fileName.endsWith(".svg") && !fileName.endsWith(".json"))
    .filter(fileName => !fileName.endsWith(".js") && !fileName.endsWith(".jsx")) // Assume .js/.jsx imports have a .d.ts available
    .reduce((imports: string[], rawImport) => {
        const resolvedImport =
            ts.resolveModuleName(
                rawImport,
                typescriptFilePath,
                config.options,
                ts.sys);
        // Depending on how fancy your ts is, the
        // "resolvedImport.resolvedModule.resolvedFileName" may not exist,
        // but should resolve for all ts files
        const importLoc = resolvedImport?.resolvedModule?.resolvedFileName;
        if (!importLoc) {
            console.log(`ERROR: File ${typescriptFilePath} imports ${rawImport} which cannot be found!!!`);
        }
        else if (!importLoc.includes("/vendor/") && !importLoc.includes('/node_modules/')) {
          imports.push(importLoc);
        }
        return imports;
    }, [])
}

/**
 * This class memoizes the list of imports for each file.
 */
export class ImportTracker {
  private imports = new Map<string, string[]>()

  constructor(private srcRoot: string, private config: ts.ParsedCommandLine) {}

  public getImports(file: string): string[] {
    const imports = this.imports.get(file) ?? getImportsForFile(file, this.srcRoot, this.config)
    if (!this.imports.has(file)) {
      this.imports.set(file, imports)
    }
    return imports
  }
}
