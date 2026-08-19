/**
 * Self-contained DSH browser-plugin build.
 *
 * The browser artifact is a closure-factory CommonJS module consumed by
 * window.__ModuleLoader__. It must not be emitted as a normal script or ESM
 * module: runtime identities come from the loader's frozen module table.
 */
import { readFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  relative as relativePath,
  resolve as resolvePath,
  sep,
} from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig, type UserConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-session-tree'
const PACKAGE_ROOT = resolvePath('.')
const CSS_VIRTUAL_PREFIX = '\0dsh-session-tree-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** The complete runtime value-import surface of this client bundle. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
] as const

function packageRelativePath(absolutePath: string): string {
  const packagePath = relativePath(PACKAGE_ROOT, absolutePath)
  if (
    packagePath === ''
    || packagePath === '..'
    || packagePath.startsWith(`..${sep}`)
    || isAbsolute(packagePath)
  ) {
    throw new Error(`client bundle asset escaped the package root: ${absolutePath}`)
  }
  return packagePath.split(sep).join('/')
}

const host: UserConfig = {
  name: PACKAGE_ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: [/^@deepseek-ai\//],
  },
  outputOptions: {
    entryFileNames: '[name].js',
  },
}

const client: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: false,
  clean: false,
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [{
    name: 'dsh-session-tree-client-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      throw new Error(
        `client bundle purity: unexpected runtime value import "${source}"; `
        + 'use injected Cordis services and type-only imports for DSH declarations',
      )
    },
  }, {
    name: 'dsh-session-tree-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const absolutePath = importer === undefined
        ? resolvePath(source)
        : resolvePath(dirname(importer), source)
      return CSS_VIRTUAL_PREFIX + packageRelativePath(resolvePath(absolutePath)) + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const packagePath = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const fileId = resolvePath(PACKAGE_ROOT, packagePath)
      packageRelativePath(fileId)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      const classEntries = Object.entries(cssExports ?? {}).sort(([left], [right]) => (
        left < right ? -1 : left > right ? 1 : 0
      ))
      for (const [local, value] of classEntries) classMap[local] = value.name
      const tagId = `${PACKAGE_ID}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([host, client])
