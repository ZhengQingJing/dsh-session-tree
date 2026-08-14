import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(packageRoot, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const failures = []

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const DEVELOPMENT_VERSION = /(?:^|[.-])(dev|development|snapshot)(?:[.-]|$)/i

function fail(message) {
  failures.push(message)
}

if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
  fail(`package.json version is not valid SemVer: ${JSON.stringify(manifest.version)}`)
} else if (DEVELOPMENT_VERSION.test(manifest.version)) {
  fail(`package.json version is a development version: ${manifest.version}`)
}

// Package managers commonly forward a standalone `--` separator. It is not a
// release-check argument, so normalize it away before validating the CLI.
const cliArguments = process.argv.slice(2).filter((argument) => argument !== '--')
const tagIndex = cliArguments.indexOf('--tag')
if (tagIndex >= 0 && cliArguments[tagIndex + 1] === undefined) {
  fail('--tag requires a value')
}
const unexpectedArguments = cliArguments.filter((argument, index, arguments_) => {
  if (argument === '--tag') return false
  if (index > 0 && arguments_[index - 1] === '--tag') return false
  return true
})
if (unexpectedArguments.length > 0) {
  fail(`unknown argument(s): ${unexpectedArguments.join(', ')}`)
}
const requestedTag = tagIndex >= 0 ? cliArguments[tagIndex + 1] : process.env.RELEASE_TAG
if (requestedTag !== undefined && requestedTag !== `v${manifest.version}`) {
  fail(`release tag ${JSON.stringify(requestedTag)} must equal v${manifest.version}`)
}

const requiredFiles = [
  'package.json',
  'README.md',
  'README.en.md',
  'LICENSE',
  'CHANGELOG.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
  'docs/DSH_SESSION_TREE_DESIGN.md',
]

for (const file of requiredFiles) {
  try {
    const stat = await lstat(join(packageRoot, file))
    if (!stat.isFile()) fail(`required release file is not a regular file: ${file}`)
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`required release file is missing: ${file}`)
    else throw error
  }
}

try {
  const changelog = await readFile(join(packageRoot, 'CHANGELOG.md'), 'utf8')
  const escapedVersion = manifest.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const versionHeading = new RegExp(`^#{1,6}\\s+(?:\\[)?${escapedVersion}(?:\\])?(?:\\s|$)`, 'm')
  if (!versionHeading.test(changelog)) {
    fail(`CHANGELOG.md has no heading for version ${manifest.version}`)
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const publishRoots = [
  'package.json',
  'README.md',
  'README.en.md',
  'LICENSE',
  'CHANGELOG.md',
  'cordis.patch.yml',
  'docs',
  'lib',
]
const secretNames = /^(?:\.env(?:\..+)?|\.npmrc|\.yarnrc(?:\.yml)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|p12|pfx|key|keystore|jks))$/i
const textExtensions = new Set(['', '.css', '.html', '.js', '.json', '.md', '.ts', '.txt', '.yaml', '.yml'])
const localPathPatterns = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:[\\/]Users[\\/][^\\/\s"'`]+[\\/]/,
  /\/private\/var\/folders\//,
]

async function collectFiles(path) {
  let stat
  try {
    stat = await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  if (stat.isSymbolicLink()) {
    fail(`publishable content contains a symbolic link: ${relative(packageRoot, path)}`)
    return []
  }
  if (stat.isFile()) return [path]
  if (!stat.isDirectory()) return []
  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) files.push(...await collectFiles(join(path, entry.name)))
  return files
}

const publishableFiles = []
for (const root of publishRoots) publishableFiles.push(...await collectFiles(join(packageRoot, root)))

const sourceMapReference = /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=)/
for (const file of publishableFiles) {
  const packagePath = relative(packageRoot, file).split(sep).join('/')
  if (secretNames.test(basename(file))) fail(`publishable content contains a potential secret file: ${packagePath}`)
  if (packagePath.startsWith('lib/') && packagePath.endsWith('.map')) {
    fail(`publishable build output contains an unexpected source map: ${packagePath}`)
  }
  if (!textExtensions.has(extname(file).toLowerCase())) continue
  const contents = await readFile(file, 'utf8')
  if (packagePath === 'lib/client.js' || packagePath.endsWith('.d.ts')) {
    if (sourceMapReference.test(contents)) fail(`${packagePath} contains a sourceMappingURL reference`)
  }
  if (localPathPatterns.some((pattern) => pattern.test(contents))) {
    fail(`publishable content contains an absolute local-machine path: ${packagePath}`)
  }
}

if (failures.length > 0) {
  console.error('Release check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Release check passed for ${manifest.name}@${manifest.version}`)
  if (requestedTag !== undefined) console.log(`Release tag verified: ${requestedTag}`)
  console.log(`Inspected ${publishableFiles.length} publishable files for path and secret-file leaks`)
}
