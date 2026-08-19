import { readFile, readdir, stat } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const hostPath = new URL('../lib/index.js', import.meta.url)
const clientPath = new URL('../lib/client.js', import.meta.url)
const [host, client, clientStat] = await Promise.all([
  readFile(hostPath, 'utf8'),
  readFile(clientPath, 'utf8'),
  stat(clientPath),
])

const EXPECTED_CLIENT_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-conversation',
]

/** High-signal regression guard; architecture review still owns the boundary. */
const FORBIDDEN_READ_ONLY_PATTERNS = [
  { pattern: /\bforkAt\b/, label: 'legacy forkAt action' },
  { pattern: /\bloadOlder\b/, label: 'Session history paging' },
  { pattern: /\bincreaseTitle\b/, label: 'fork title mutation' },
  {
    pattern: /(?:\.|\[\s*['"])(?:fork|rename|append|prompt|updateQueue|cancel|command)(?:['"]\s*\])?\s*(?:\?\.)?\s*\(/,
    label: 'possible Session/model mutation call',
  },
  { pattern: /\b(?:SessionEventMap|session\/event)\b/, label: 'custom Session event surface' },
]

function requireText(source, fragment, label) {
  if (!source.includes(fragment)) throw new Error(`bundle check: missing ${label}`)
}

function enforceReadOnlyBoundary(source, label) {
  for (const forbidden of FORBIDDEN_READ_ONLY_PATTERNS) {
    if (forbidden.pattern.test(source)) {
      throw new Error(`bundle check: ${label} contains forbidden ${forbidden.label}`)
    }
  }
}

async function collectTypeScriptSources(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) files.push(...await collectTypeScriptSources(target))
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(target)
  }
  return files
}

if (manifest.exports?.['./client']?.default !== './lib/client.js') {
  throw new Error('bundle check: package exports do not expose ./lib/client.js')
}
if (manifest.dsh?.client?.platform !== 'web') {
  throw new Error('bundle check: package does not declare a Web client')
}
if (JSON.stringify(manifest.dsh?.client?.inject) !== JSON.stringify(EXPECTED_CLIENT_INJECT)) {
  throw new Error(
    'bundle check: dsh.client.inject must contain only locale, runtime, and ui-conversation in canonical order',
  )
}
if (!manifest.files?.includes('lib/client.js')) {
  throw new Error('bundle check: packed files omit lib/client.js')
}

const sourceFiles = await collectTypeScriptSources(new URL('../src/', import.meta.url))
for (const sourceFile of sourceFiles) {
  enforceReadOnlyBoundary(await readFile(sourceFile, 'utf8'), sourceFile.pathname)
}
enforceReadOnlyBoundary(host, 'lib/index.js')
enforceReadOnlyBoundary(client, 'lib/client.js')

requireText(host, 'function apply()', 'Host apply export')
requireText(client, 'window.__ModuleLoader__.load({', 'DSH module-loader wrapper')
requireText(client, 'id: "dsh-session-tree"', 'module-loader package id')
requireText(client, 'factory: (require) => {', 'module-loader factory')
requireText(client, 'return module.exports;', 'CommonJS factory return')
requireText(client, 'require("react")', 'external React lookup')
requireText(client, 'require("react/jsx-runtime")', 'external JSX runtime lookup')
requireText(client, 'tag.dataset.plugin = "dsh-session-tree"', 'plugin-owned CSS tag')

if (/^\s*import\s/m.test(client)) {
  throw new Error('bundle check: browser artifact contains a raw ESM import')
}
if (client.includes('ReactCurrentDispatcher')) {
  throw new Error('bundle check: React runtime was inlined instead of shared')
}
if (clientStat.size > 128 * 1024) {
  throw new Error(`bundle check: client artifact unexpectedly exceeds 128 KiB (${clientStat.size} bytes)`)
}

let registration
let styleTag
const document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {} }),
  head: {
    appendChild(tag) {
      styleTag = tag
    },
  },
}
runInNewContext(client, {
  document,
  window: {
    __ModuleLoader__: {
      load(value) {
        registration = value
      },
    },
  },
}, { filename: 'lib/client.js' })
if (registration?.id !== 'dsh-session-tree' || typeof registration.factory !== 'function') {
  throw new Error('bundle check: module-loader registration is not executable')
}
const requestedModules = []
const browserExports = registration.factory((id) => {
  requestedModules.push(id)
  return {}
})
if (typeof browserExports?.apply !== 'function' || !Array.isArray(browserExports.inject)) {
  throw new Error('bundle check: client factory does not return the Cordis plugin exports')
}
const uniqueRequestedModules = [...new Set(requestedModules)].sort()
const expectedRequestedModules = ['react', 'react/jsx-runtime'].sort()
if (JSON.stringify(uniqueRequestedModules) !== JSON.stringify(expectedRequestedModules)) {
  throw new Error(
    `bundle check: client factory requested unexpected modules: ${JSON.stringify(uniqueRequestedModules)}`,
  )
}
if (styleTag?.dataset?.plugin !== 'dsh-session-tree' || typeof styleTag.textContent !== 'string') {
  throw new Error('bundle check: CSS Module did not create a plugin-owned style tag')
}

process.stdout.write(`bundle check: Host and ${clientStat.size}-byte DSH client artifacts are valid\n`)
