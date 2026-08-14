import { lstat, readFile, rm } from 'node:fs/promises'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDirectory, '..')
const outputDirectory = resolve(packageRoot, 'lib')

function assertSafeOutputPath() {
  const root = parse(packageRoot).root
  if (packageRoot === root) {
    throw new Error('Refusing to clean: the package root resolved to a filesystem root')
  }
  if (outputDirectory !== join(packageRoot, 'lib')) {
    throw new Error('Refusing to clean: output path is not exactly <package-root>/lib')
  }
  if (dirname(outputDirectory) !== packageRoot || !outputDirectory.endsWith(`${sep}lib`)) {
    throw new Error('Refusing to clean: output path escaped the package root')
  }
}

async function assertPackageRoot() {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  if (manifest.name !== 'dsh-session-tree') {
    throw new Error('Refusing to clean: package root identity check failed')
  }
}

assertSafeOutputPath()
await assertPackageRoot()

try {
  await lstat(outputDirectory)
} catch (error) {
  if (error?.code === 'ENOENT') process.exit(0)
  throw error
}

await rm(outputDirectory, { recursive: true, force: false, maxRetries: 2 })
