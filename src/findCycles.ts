import ts = require('typescript')
import { getImportsForFile } from './tsHelper'

// Uses Kosaraju's algorithm to find strongly-connected components
// in the codebase's dependency graph. See the wikipedia article
// for why it works.
// https://en.wikipedia.org/wiki/Kosaraju%27s_algorithm
//
// Return a list of (list of files in a cycle, which may be just one file).
export type Imports = {
  [filename: string]: string[];
}
export type FileToRoot = {
  [filename: string]: string;
}

export function findCycles(srcRoot: string, files: string[], config: ts.ParsedCommandLine): string[][] {
  const imports: Imports = {};
  const importers: Imports = {};

  let filesInVisitOrder: string[] = [];

  // Step 1: do a post-order traversal of the dependency tree
  const visit = (file: string) => {
    if (!imports[file]) {
      const importList = getImportsForFile(file, srcRoot, config)
      imports[file] = importList;

      // Recursively traverse imports
      for (const imp of importList) {
        visit(imp);

        // Also build the reverse graph while we're at it
        if (!importers[imp]) {
          importers[imp] = [file];
        }
        else {
          importers[imp].push(file);
        }
      }

      filesInVisitOrder.push(file);
    }
  }


  for (const file of files) {
    visit(file);
  }

  filesInVisitOrder.reverse();

  const fileToRoot: FileToRoot = {};
  const rootToFiles: Imports = {};

  // Step 2: traverse the graph again, but in the reverse direction
  // This groups files into strongly connected-components using information
  // obtained in step 1.
  const assign = (file: string, root: string) => {
    if (!fileToRoot[file]) {
      fileToRoot[file] = root;

      if (!rootToFiles[root]) {
        rootToFiles[root] = [file]; // array is fine since each file gets visited at most once
      }
      else {
        rootToFiles[root].push(file);
      }

      if (importers[file]) {
        for (const importer of importers[file]) {
          assign(importer, root);
        }
      }
    }
  }

  for (const file of filesInVisitOrder) {
    assign(file, file);
  }

  return Object.values(rootToFiles);
}
