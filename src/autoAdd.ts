import * as fs from 'fs'
import * as path from 'path'
import { listStrictNullCheckEligibleFiles, getTsConfig } from './getStrictNullCheckEligibleFiles'
import { ErrorCounter } from './errorCounter'
import { normalizeTsconfigPath } from './tsHelper';

const tsconfigPath = normalizeTsconfigPath(process.argv[2])
const srcRoot = path.dirname(tsconfigPath)

tryAutoAddStrictNulls()

async function tryAutoAddStrictNulls() {
  let hasAddedFile = true;
  const config = await getTsConfig(tsconfigPath);
  const checkedFiles = [...config.fileNames];

  const errorCounter = new ErrorCounter(tsconfigPath);

  // As long as auto-add adds a file, it's possible there's a new file that
  // depends on one of the newly-added files that can now be strict null checked
  while (hasAddedFile) {
    hasAddedFile = false;

    const eligibleFiles = await listStrictNullCheckEligibleFiles(srcRoot, config, checkedFiles);

    errorCounter.start()
    for (let i = 0; i < eligibleFiles.length; i++) {
      const relativeFilePath = path.relative(srcRoot, eligibleFiles[i]);
      console.log(`Trying to auto add '${relativeFilePath}' (file ${i+1}/${eligibleFiles.length})`);

      const errorCount = await errorCounter.tryCheckingFile(relativeFilePath);
      if (errorCount === 0) {
        console.log(`👍`);
        addFileToConfig(relativeFilePath);
        hasAddedFile = true;
      }
      else {
        console.log(`💥 - ${errorCount}`);
      }

      // No point in trying to whitelist the file twice, regardless or success or failure
      checkedFiles.push(eligibleFiles[i]);
    }
    errorCounter.end();
  }
}

function addFileToConfig(relativeFilePath: string) {
  const config = JSON.parse(fs.readFileSync(tsconfigPath).toString());
  const excludeIndex = config.exclude?.indexOf(relativeFilePath) ?? -1;
  if (excludeIndex >= 0) {
    config.exclude.splice(excludeIndex, 1);
  } else {
    config.files.push(relativeFilePath);
    config.files.sort();
  }
  fs.writeFileSync(tsconfigPath, `${JSON.stringify(config, null, 2)}\n`);
}
