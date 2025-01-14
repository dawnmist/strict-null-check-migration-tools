import * as fs from 'fs'
import { spawn, ChildProcessWithoutNullStreams, execSync } from 'child_process'

const buildCompletePattern = /Found (\d+) errors?\. Watching for file changes\./gi

export class ErrorCounter {
  private tscProcess?: ChildProcessWithoutNullStreams
  private tsconfigCopyPath?: string
  private originalConfig: any

  constructor(private tsconfigPath: string) {}

  public start(): void {
    this.tsconfigCopyPath = this.tsconfigPath + `copy${Math.floor(Math.random() * (1 << 16))}.json`

    // Make a copy of tsconfig because we're going to keep modifying it.
    execSync(`cp ${this.tsconfigPath} ${this.tsconfigCopyPath}`)
    this.originalConfig = JSON.parse(fs.readFileSync(this.tsconfigCopyPath).toString())

    // Opens TypeScript in watch mode so that it can (hopefully) incrementally
    // compile as we add and remove files from the whitelist.
    this.tscProcess = spawn('node_modules/typescript/bin/tsc', ['-p', this.tsconfigCopyPath, '--watch', '--noEmit'])
  }

  public end(): void {
    if (!this.tscProcess) {
      throw Error('No typescript typecheck process set in ErrorCounter::end()!');
    }

    this.tscProcess.kill()
    execSync(`rm ${this.tsconfigCopyPath}`)
  }

  public async tryCheckingFile(relativeFilePath: string): Promise<number> {
    return new Promise<number>(resolve => {
      if (!this.tscProcess) {
        throw Error('No typescript typecheck process set in ErrorCounter::tryCheckingFile()!');
      }
      if (!this.tsconfigCopyPath) {
        throw Error('No tsconfig copy path set in ErrorCounter::tryCheckingFile()!');
      }
      const listener = (data: any) => {
        if (!this.tscProcess) {
          throw Error('No typescript typecheck process set  in ErrorCounter::tryCheckingFile()::listener()!');
        }
        const textOut = data.toString()
        console.log(textOut)
        const match = buildCompletePattern.exec(textOut)

        if (match) {
          this.tscProcess.stdout.removeListener('data', listener)
          const errorCount = +match[1]
          resolve(errorCount)
        }
      }

      this.tscProcess.stdout.on('data', listener)

      // Create a new config with the file added to files
      const files = [...this.originalConfig.files, relativeFilePath];
      fs.writeFileSync(this.tsconfigCopyPath, `${JSON.stringify({
        ...this.originalConfig,
        files,
      }, null, 2)}\n`);
    })
  }
}
