import * as path from 'path'
import { forEachFileInSrc, getTsConfig } from './getStrictNullCheckEligibleFiles'
import { normalizeTsconfigPath } from './tsHelper';

const tsconfigPath = normalizeTsconfigPath(process.argv[2]);
console.log(tsconfigPath);
const srcRoot = path.dirname(tsconfigPath);

findRemainingFiles();

async function findRemainingFiles() {
  const config = await getTsConfig(tsconfigPath);
  const files = await forEachFileInSrc(srcRoot);
  console.log('Files not being strict-null-checked:');
  console.log('------------------------------------');
  for (const file of files) {
    if (!config.fileNames.includes(file)) {
      console.log(toFormattedFilePath(file));
    }
  }
}

function toFormattedFilePath(file: string) {
  // return `"${path.relative(srcRoot, file)}",`;
  return `- [ ] \`"${path.relative(srcRoot, file)}"\``;
}
