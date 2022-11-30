import * as path from 'path'
import { ErrorCounter } from './errorCounter';
import { Imports } from './findCycles';
import { listStrictNullCheckEligibleFiles, forEachFileInSrc, getTsConfig, listStrictNullCheckEligibleCycles } from './getStrictNullCheckEligibleFiles'
import { getImportsForFile, normalizeTsconfigPath } from './tsHelper';

const tsconfigPath = normalizeTsconfigPath(process.argv[2]);
console.log(tsconfigPath);
const srcRoot = path.dirname(tsconfigPath);
const countErrors = process.argv.indexOf('--countErrors') >= 0;

let printDependedOnCount = true;

findCandidates();

async function findCandidates() {
  const config = await getTsConfig(tsconfigPath);
  const eligibleFiles = await listStrictNullCheckEligibleFiles(srcRoot, config, config.fileNames);
  const eligibleCycles = await listStrictNullCheckEligibleCycles(srcRoot, config);

  if (eligibleCycles.length > 0) {
    console.log("The following cycles are eligible for enabling strictNullChecks!");
    for (const filesInCycle of eligibleCycles) {
      console.log(`Cycle of ${filesInCycle.length} files:`);
      for (const file of filesInCycle) {
        console.log(`  ${file}`);
      }
    }
  }

  const fileToImports: Imports = {};
  for (const file of await forEachFileInSrc(srcRoot)) {
    fileToImports[file] = getImportsForFile(file, srcRoot, config);
  }

  const fileToImportsSecondOrder = oneLevelDownImports(fileToImports);
  const fileToImportsThirdOrder = oneLevelDownImports(fileToImportsSecondOrder);

  const dependedOnCount = countImporters(eligibleFiles, fileToImports);
  const dependedOnCountThirdOrder = countImporters(eligibleFiles, fileToImportsThirdOrder);

  let fileDependencyCountArray = Array.from(Object.entries(dependedOnCountThirdOrder));
  fileDependencyCountArray = fileDependencyCountArray.sort(([aFile, aCount], [bFile, bCount]) => {
    if (aCount !== bCount) {
      return bCount - aCount;
    } else {
      return aFile.localeCompare(bFile);
    }
  });

  let errorCounts: FileCounts = {};
  if (countErrors) {
    let errorCounter = new ErrorCounter(tsconfigPath);
    errorCounter.start();

    errorCounts = await eligibleFiles.reduce(
      async (accumulator: Promise<FileCounts>, file): Promise<FileCounts> =>{
        const out = await accumulator;
        const relativePath = path.relative(srcRoot, file);
        out[file] = await errorCounter.tryCheckingFile(relativePath);
        return out;
      }, Promise.resolve({}));

    errorCounter.end();
  }

  console.log(`There are ${Object.keys(dependedOnCountThirdOrder).length} files eligible for enabling strictNullChecks!`);
  console.log("These files only depend on other files for which strictNullCheck has already been enabled.");
  if (printDependedOnCount) {
    console.log("The dependency count is approximate (this script only resolves up to third order imports).");
    for (const [file, count] of fileDependencyCountArray) {
      const formatted = toFormattedFilePath(file);
      const direct = dependedOnCount[file];
      const errors = errorCounts[file] ?? 0;
      const errorString = countErrors ? ` - has ${errors} error(s) to fix` : '';
      console.log(`${formatted} — Depended on by >**${count}** files (${direct} direct imports)${errorString}`);
    }
  } else {
    for (const [file, /*count*/] of fileDependencyCountArray) {
      console.log(toFormattedFilePath(file));
    }
  }
}

function toFormattedFilePath(file: string) {
  // return `"${path.relative(srcRoot, file)}",`;
  return `- [ ] \`"${path.relative(srcRoot, file)}"\``;
}

// Input: a map of files to the list of 1st order imports (files directly imported)
// Output: a map of files to the list of 1st and 2nd order imports
function oneLevelDownImports(fileToImports: Imports): Imports {
  return Object.keys(fileToImports).reduce((out: Imports, file) => {
    const imports = fileToImports[file];
    // Initialize with direct imports
    const nestedImports = [...imports];

    // Add imports from imports
    for (const imp of imports) {
      if (fileToImports[imp]) {
        for (const nestedImport of fileToImports[imp]) {
          nestedImports.push(nestedImport);
        }
      }
    }
    out[file] = nestedImports;
    return out;
  }, {});
}

type FileCounts = {
  [filename: string]: number;
};

function countImporters(files: string[], fileToImports: Imports): FileCounts {
  const initialDepends = files.reduce((out: FileCounts, file) => {
    out[file] = 0;
    return out;
  }, {});
  return Object.keys(fileToImports).reduce((dependedOnCount: FileCounts, file) => {
    const imports = fileToImports[file];
    for (const imp of imports) {
      if (typeof dependedOnCount[imp] === 'number') {
        dependedOnCount[imp] = dependedOnCount[imp] + 1;
      }
    }
    return dependedOnCount;
  }, initialDepends)
}
