import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageManagerCli = process.env.npm_execpath
const nodeExecutable = process.env.npm_node_execpath ?? process.execPath
if (!packageManagerCli) {
  throw new Error('check:reproducible must run through the pinned pnpm lifecycle')
}
const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-session-tree-reproducible-'))

async function packOnce(pass) {
  const destination = join(temporaryRoot, `pass-${pass}`)
  await mkdir(destination)
  execFileSync(nodeExecutable, [packageManagerCli, 'pack', '--pack-destination', destination], {
    cwd: packageRoot,
    stdio: 'inherit',
  })

  const archives = (await readdir(destination)).filter((name) => name.endsWith('.tgz'))
  if (archives.length !== 1) {
    throw new Error(`reproducible build pass ${pass} produced ${archives.length} package archives`)
  }

  const archive = archives[0]
  const bytes = await readFile(join(destination, archive))
  return {
    archive,
    digest: createHash('sha256').update(bytes).digest('hex'),
  }
}

try {
  const first = await packOnce(1)
  const second = await packOnce(2)
  if (first.archive !== second.archive || first.digest !== second.digest) {
    throw new Error([
      'package builds are not byte reproducible',
      `pass 1: ${first.archive} sha256:${first.digest}`,
      `pass 2: ${second.archive} sha256:${second.digest}`,
    ].join('\n'))
  }
  console.log(`reproducible package: ${first.archive} sha256:${first.digest}`)
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
