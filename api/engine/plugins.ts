import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { NodeMeta } from './nodes.js'
import { NODE_REGISTRY } from './nodes.js'
import { nodeRegistry } from './nodes/registry.js'
import type { NodeExecutor } from './nodes/registry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type PluginManifest = {
  type: string
  label: string
  group: NodeMeta['group']
  color: string
  description?: string
}

export function loadPluginNodes(): NodeMeta[] {
  const pluginsDir = path.join(__dirname, '..', 'plugins')
  if (!existsSync(pluginsDir)) return []

  const loaded: NodeMeta[] = []
  for (const name of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const manifestPath = path.join(pluginsDir, name.name, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
      if (!manifest.type || NODE_REGISTRY.some((n) => n.type === manifest.type)) continue
      loaded.push({
        type: manifest.type,
        label: manifest.label,
        group: manifest.group,
        color: manifest.color,
        description: manifest.description,
        outputs: 1,
      })
    } catch (e) {
      console.warn('[plugins] skip', name.name, e)
    }

    const executorPath = path.join(pluginsDir, name.name, 'executor.ts')
    const executorBuiltPath = path.join(pluginsDir, name.name, 'executor.js')
    const foundPath = existsSync(executorBuiltPath) ? executorBuiltPath : existsSync(executorPath) ? executorPath : null
    if (foundPath) {
      const fileUrl = pathToFileURL(foundPath).href
      import(fileUrl)
        .then((mod: { default?: NodeExecutor }) => {
          if (mod.default) {
            nodeRegistry.register(mod.default)
            console.log(`[plugins] registered executor: ${mod.default.type}`)
          }
        })
        .catch((e: unknown) => {
          console.warn(`[plugins] failed to load executor ${name.name}:`, e)
        })
    }
  }
  return loaded
}

export function getAllNodeRegistry(): NodeMeta[] {
  return [...NODE_REGISTRY, ...loadPluginNodes()]
}
