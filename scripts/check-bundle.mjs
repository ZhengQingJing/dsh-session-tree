import { readFile, stat } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const hostPath = new URL('../lib/index.js', import.meta.url)
const clientPath = new URL('../lib/client.js', import.meta.url)
const [host, client, clientStat] = await Promise.all([
  readFile(hostPath, 'utf8'),
  readFile(clientPath, 'utf8'),
  stat(clientPath),
])

function requireText(source, fragment, label) {
  if (!source.includes(fragment)) throw new Error(`bundle check: missing ${label}`)
}

if (manifest.exports?.['./client']?.default !== './lib/client.js') {
  throw new Error('bundle check: package exports do not expose ./lib/client.js')
}
if (manifest.dsh?.client?.platform !== 'web') {
  throw new Error('bundle check: package does not declare a Web client')
}
if (!manifest.files?.includes('lib/client.js')) {
  throw new Error('bundle check: packed files omit lib/client.js')
}

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
if (clientStat.size > 256 * 1024) {
  throw new Error(`bundle check: client artifact unexpectedly exceeds 256 KiB (${clientStat.size} bytes)`)
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
if (!requestedModules.includes('react') || !requestedModules.includes('react/jsx-runtime')) {
  throw new Error('bundle check: client factory did not resolve shared React modules')
}
if (styleTag?.dataset?.plugin !== 'dsh-session-tree' || typeof styleTag.textContent !== 'string') {
  throw new Error('bundle check: CSS Module did not create a plugin-owned style tag')
}

process.stdout.write(`bundle check: Host and ${clientStat.size}-byte DSH client artifacts are valid\n`)
