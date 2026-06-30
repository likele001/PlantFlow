import { db } from '../store.js'

export async function getDefaultProvider(tenantId: string) {
  const providers = await db.listProviders(tenantId)
  const provider = providers.find((p) => p.isDefault) ?? providers[0]
  if (!provider) throw new Error('未配置 AI 模型提供商')
  const secret = await db.getProviderSecret(tenantId, provider.id)
  if (!secret) throw new Error('AI 提供商凭据不可用')
  return { provider, secret }
}

export async function getEmbeddingProvider(tenantId: string) {
  const providers = await db.listProviders(tenantId)
  const provider = providers.find((p) => p.isDefaultEmbedding && p.defaultEmbeddingModel)
    ?? providers.find((p) => p.isDefault && p.defaultEmbeddingModel)
    ?? providers[0]
  if (!provider) throw new Error('未配置 AI 模型提供商')
  if (!provider.defaultEmbeddingModel) throw new Error('未配置 Embedding 模型')
  const secret = await db.getProviderSecret(tenantId, provider.id)
  if (!secret) throw new Error('AI 提供商凭据不可用')
  return { provider, secret }
}

export async function chatCompletion(
  tenantId: string,
  messages: { role: string; content: string; tool_calls?: unknown }[],
  opts?: { model?: string; tools?: unknown[]; temperature?: number },
) {
  const { provider, secret } = await getDefaultProvider(tenantId)
  const model = opts?.model || provider.defaultChatModel
  const url = `${secret.baseUrl}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts?.temperature ?? 0.3,
  }
  if (opts?.tools?.length) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await r.json().catch(() => null)) as {
    choices?: { message?: { content?: string; tool_calls?: unknown[] } }[]
    error?: { message?: string }
  } | null
  if (!r.ok) throw new Error(data?.error?.message ?? `LLM HTTP ${r.status}`)
  return data?.choices?.[0]?.message ?? { content: '' }
}

export async function chatCompletionStream(
  tenantId: string,
  messages: { role: string; content: string }[],
  onDelta: (text: string) => void,
  opts?: { model?: string },
): Promise<string> {
  const { provider, secret } = await getDefaultProvider(tenantId)
  const model = opts?.model || provider.defaultChatModel
  const url = `${secret.baseUrl}/chat/completions`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret.apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.3, stream: true }),
  })
  if (!r.ok || !r.body) {
    const err = await r.text()
    throw new Error(err || `LLM HTTP ${r.status}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch { /* skip */ }
    }
  }
  return full
}

export async function createEmbedding(tenantId: string, text: string): Promise<number[]> {
  const { provider, secret } = await getEmbeddingProvider(tenantId)
  const model = provider.defaultEmbeddingModel!
  const url = `${secret.baseUrl}/embeddings`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret.apiKey}`,
    },
    body: JSON.stringify({ model, input: text.slice(0, 8000) }),
  })
  const data = (await r.json().catch(() => null)) as {
    data?: { embedding?: number[] }[]
    error?: { message?: string }
  } | null
  if (!r.ok) throw new Error(data?.error?.message ?? `Embedding HTTP ${r.status}`)
  const vec = data?.data?.[0]?.embedding
  if (!vec?.length) throw new Error('Embedding 返回为空')
  return vec
}
