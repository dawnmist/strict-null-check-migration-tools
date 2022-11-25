import * as path from 'path'
import { Imports } from './findCycles';
import { listStrictNullCheckEligibleFiles, forEachFileInSrc, getTsConfig, listStrictNullCheckEligibleCycles } from './getStrictNullCheckEligibleFiles'
import { getImportsForFile, normalizeTsconfigPath } from './tsHelper';

const tsconfigPath = normalizeTsconfigPath(process.argv[2]);
console.log(tsconfigPath);
const srcRoot = path.dirname(tsconfigPath);

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

  console.log("Here at the list of files eligible for enabling strictNullChecks!");
  console.log("These files only depend on other files for which strictNullCheck has already been enabled.");
  if (printDependedOnCount) {
    console.log("The dependency count is approximate (this script only resolves up to third order imports).");
    for (const [file, count] of fileDependencyCountArray) {
      const formatted = toFormattedFilePath(file);
      const direct = dependedOnCount[file];
      console.log(`${formatted} — Depended on by >**${count}** files (${direct} direct imports)`);
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

type ImportCounts = {
  [filename: string]: number;
};

function countImporters(files: string[], fileToImports: Imports): ImportCounts {
  return Object.keys(fileToImports).reduce((dependedOnCount: ImportCounts, file) => {
    const imports = fileToImports[file];
    for (const imp of imports) {
      const currentCount = dependedOnCount[imp] ?? 0;
      dependedOnCount[imp] = currentCount + 1;
    }
    return dependedOnCount;
  }, {})
}
