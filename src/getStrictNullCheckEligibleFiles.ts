import * as ts from 'typescript'
import * as path from 'path'
import * as glob from 'glob'
import { ImportTracker } from './tsHelper'
import { findCycles } from './findCycles'

function considerFile(file: string): boolean {
  return (file.endsWith('.ts') || file.endsWith('.tsx')) &&
         !file.endsWith('.stories.tsx');
}

function hasUncheckedImport(file: string, importsTracker: ImportTracker, checkedFiles: string[]): boolean {
  const imports = importsTracker.getImports(file);
  for (const imp of imports) {
    if (!checkedFiles.includes(imp)) {
      return true;
    }
  }
  return false;
}

export function forEachFileInSrc(srcRoot: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(`${srcRoot}/!(vendor|node_modules)/**/*.ts?(x)`, (err, files) => {
      if (err) {
        return reject(err);
      }

      return resolve(files.filter(considerFile));
    })
  })
}

/**
 * This function returns the list of files that could be whitelisted next, because
 * they don't depend on any file that hasn't been whitelisted.
 */
export async function listStrictNullCheckEligibleFiles(
  srcRoot: string,
  config: ts.ParsedCommandLine,
  checkedFiles: string[]): Promise<string[]> {

  const importsTracker = new ImportTracker(srcRoot, config);

  const files = await forEachFileInSrc(srcRoot);
  return files.filter(file => {
    if (checkedFiles.includes(file)) {
      return false;
    }
    return !hasUncheckedImport(file, importsTracker, checkedFiles);
  })
}

/**
 * This function returns the list of cycles of files that could be whitelisted next, because
 * none of the file in that cycle don't depend on any file that hasn't been whitelisted.
 */
export async function listStrictNullCheckEligibleCycles(
  srcRoot: string,
  config: ts.ParsedCommandLine): Promise<string[][]> {

  const importsTracker = new ImportTracker(srcRoot, config);

  const files = await forEachFileInSrc(srcRoot);
  const cycles = findCycles(srcRoot, files, config);
  return cycles.filter(filesInCycle => {
    // A single file is not a cycle
    if (filesInCycle.length <= 1) {
      return false;
    }

    let cycleIsChecked = true;
    for (const file of filesInCycle) {
      if (!config.fileNames.includes(file)) {
        cycleIsChecked = false;
        break;
      }
    }

    // The whole cycle has already been whitelisted
    if (cycleIsChecked) {
      return false;
    }

    // All imports of all files in the cycle must have
    // been whitelisted for the cycle to be eligible
    for (const file of files) {
      if (hasUncheckedImport(file, importsTracker, config.fileNames)) {
        return false;
      }
    }
    return true;
  })
}

/**
 * This function returns the list of files that have already been whitelisted into
 * --strictNullChecks.
 */
export async function getTsConfig(tsconfigPath: string): Promise<ts.ParsedCommandLine> {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const configFileContent = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );

  return configFileContent;
}
