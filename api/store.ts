/**
 * PG-backed data access. The exported `db` shape mirrors the previous
 * in-memory store closely so route handlers can be updated with minimal
 * changes (mostly adding `await`).
 */
import bcrypt from 'bcryptjs'
import { pool } from './db.js'
import type { WorkflowDefinition } from './engine/types.js'
import { redisPushJob } from './redis.js'

export type Id = string

export type Tenant = {
  id: Id
  name: string
  createdAt: string
}

export type User = {
  id: Id
  email: string
  password: string
  createdAt: string
}

export type Membership = {
  id: Id
  tenantId: Id
  userId: Id
  role: 'platform_admin' | 'tenant_admin' | 'developer' | 'operator' | 'agent'
}

export type Workflow = {
  id: Id
  tenantId: Id
  name: string
  status: 'draft' | 'published' | 'archived'
  definition?: WorkflowDefinition
  createdAt: string
  updatedAt: string
}

export type Execution = {
  id: Id
  tenantId: Id
  workflowId: Id
  workflowName?: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  triggerType: string
  triggerData?: unknown
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

export type ExecutionStep = {
  id: Id
  executionId: Id
  nodeId: string
  nodeType: string
  nodeLabel: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

export type KnowledgeBase = {
  id: Id
  tenantId: Id
  name: string
  description?: string | null
  documentCount?: number
  chunkCount?: number
  vectorizedChunkCount?: number
  createdAt: string
  updatedAt: string
}

export type KnowledgeDocument = {
  id: Id
  kbaseId: Id
  tenantId: Id
  title: string
  sourceType: string
  content: string
  createdAt: string
}

export type KnowledgeChunkHit = {
  id: Id
  content: string
  title: string
  score: number
}

export type Connector = {
  id: Id
  tenantId: Id
  name: string
  type: 'http' | 'database' | 'wecom' | 'feishu' | 'custom'
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AuditLog = {
  id: Id
  tenantId: Id
  userId?: Id | null
  userEmail?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  detail?: unknown
  createdAt: string
}

export type TenantMember = {
  membershipId: Id
  userId: Id
  email: string
  role: Membership['role']
  createdAt: string
}

export type DashboardStats = {
  executionsToday: number
  successRate: number
  alertsToday: number
  messagesToday: number
  aiCallsToday: number
  failureTop: { workflowName: string; reason: string; count: number }[]
}

export type Conversation = {
  id: Id
  tenantId: Id
  channel: 'wecom' | 'feishu'
  externalId: string
  kind: 'group' | 'direct'
  title: string
  updatedAt: string
}

export type Message = {
  id: Id
  tenantId: Id
  conversationId: Id
  direction: 'in' | 'out'
  senderId: string
  senderName?: string
  content: string
  createdAt: string
  raw?: unknown
}

export type WecomChannelConfig = {
  corpId: string
  agentId: string
  secret: string
  token: string
  encodingAESKey: string
}

export type FeishuChannelConfig = {
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
}

export type ChannelConfig = {
  tenantId: Id
  wecom?: WecomChannelConfig
  feishu?: FeishuChannelConfig
}

type TokenSession = {
  token: string
  userId: Id
  tenantId: Id
  createdAt: string
}

type CachedToken = {
  token: string
  expiresAt: number
}

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  // Use crypto.randomUUID (available in Node 19+; container runs node:22)
  return crypto.randomUUID()
}

/* ---------- LLM providers ---------- */

export type LlmProvider = {
  id: Id
  tenantId: Id
  name: string
  baseUrl: string
  apiKeyMasked: string
  defaultChatModel: string
  defaultEmbeddingModel: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type LlmProviderSecret = {
  baseUrl: string
  apiKey: string
}

const PROVIDER_COLS = `
  id, tenant_id AS "tenantId", name, base_url AS "baseUrl",
  api_key_masked AS "apiKeyMasked",
  default_chat_model AS "defaultChatModel",
  default_embedding_model AS "defaultEmbeddingModel",
  is_default AS "isDefault",
  created_at AS "createdAt", updated_at AS "updatedAt"
`

export async function listProviders(tenantId: Id): Promise<LlmProvider[]> {
  const { rows } = await pool.query<LlmProvider>(
    `SELECT ${PROVIDER_COLS} FROM llm_providers WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC`,
    [tenantId],
  )
  return rows
}

export async function findProvider(
  tenantId: Id,
  id: Id,
): Promise<LlmProvider | null> {
  const { rows } = await pool.query<LlmProvider>(
    `SELECT ${PROVIDER_COLS} FROM llm_providers WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function getProviderSecret(
  tenantId: Id,
  id: Id,
): Promise<LlmProviderSecret | null> {
  const { rows } = await pool.query<{
    baseUrl: string
    apiKeyIv: Buffer
    apiKeyTag: Buffer
    apiKeyCiphertext: Buffer
  }>(
    `SELECT base_url AS "baseUrl",
            api_key_iv AS "apiKeyIv",
            api_key_tag AS "apiKeyTag",
            api_key_ciphertext AS "apiKeyCiphertext"
       FROM llm_providers WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  if (!rows[0]) return null
  const { decryptSecret } = await import('./crypto.js')
  const apiKey = decryptSecret({
    iv: rows[0].apiKeyIv,
    tag: rows[0].apiKeyTag,
    ciphertext: rows[0].apiKeyCiphertext,
  })
  return { baseUrl: rows[0].baseUrl, apiKey }
}

export async function insertProvider(input: {
  tenantId: Id
  name: string
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  defaultChatModel: string
  defaultEmbeddingModel: string | null
  isDefault: boolean
}): Promise<LlmProvider> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = encryptSecret(input.apiKey)
  const { rows } = await pool.query<LlmProvider>(
    `INSERT INTO llm_providers
       (tenant_id, name, base_url, api_key_iv, api_key_tag, api_key_ciphertext,
        api_key_masked, default_chat_model, default_embedding_model, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${PROVIDER_COLS}`,
    [
      input.tenantId,
      input.name,
      input.baseUrl,
      enc.iv,
      enc.tag,
      enc.ciphertext,
      input.apiKeyMasked,
      input.defaultChatModel,
      input.defaultEmbeddingModel,
      input.isDefault,
    ],
  )
  return rows[0]
}

export async function updateProvider(input: {
  tenantId: Id
  id: Id
  name?: string
  baseUrl?: string
  apiKey?: string
  apiKeyMasked?: string
  defaultChatModel?: string
  defaultEmbeddingModel?: string | null
}): Promise<LlmProvider | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${i++}`)
    vals.push(v)
  }
  if (input.name !== undefined) push('name', input.name)
  if (input.baseUrl !== undefined) push('base_url', input.baseUrl)
  if (input.defaultChatModel !== undefined) push('default_chat_model', input.defaultChatModel)
  if (input.defaultEmbeddingModel !== undefined) push('default_embedding_model', input.defaultEmbeddingModel)
  if (input.apiKey !== undefined) {
    const { encryptSecret } = await import('./crypto.js')
    const enc = encryptSecret(input.apiKey)
    push('api_key_iv', enc.iv)
    push('api_key_tag', enc.tag)
    push('api_key_ciphertext', enc.ciphertext)
    if (input.apiKeyMasked !== undefined) push('api_key_masked', input.apiKeyMasked)
  }
  if (sets.length === 0) return findProvider(input.tenantId, input.id)
  sets.push('updated_at = now()')
  vals.push(input.tenantId, input.id)
  const { rows } = await pool.query<LlmProvider>(
    `UPDATE llm_providers SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING ${PROVIDER_COLS}`,
    vals,
  )
  return rows[0] ?? null
}

export async function deleteProvider(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM llm_providers WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

/**
 * Mark a provider as default for its tenant. Uses a transaction so the
 * partial unique index `uniq_llm_providers_default_per_tenant` is honored
 * (clear others, then set the target).
 */
export async function setDefaultProvider(tenantId: Id, id: Id): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE llm_providers SET is_default = false, updated_at = now() WHERE tenant_id = $1`,
      [tenantId],
    )
    await client.query(
      `UPDATE llm_providers SET is_default = true, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}



export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) return bcrypt.compare(password, stored)
  return stored === password
}

export async function findUserByEmailAndPassword(
  email: string,
  password: string,
): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, password, created_at AS "createdAt" FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  const user = rows[0]
  if (!user) return null
  const ok = await verifyPassword(password, user.password)
  if (!ok) return null
  if (!user.password.startsWith('$2')) {
    const hashed = await hashPassword(password)
    await pool.query(`UPDATE users SET password = $2 WHERE id = $1`, [user.id, hashed])
    user.password = hashed
  }
  return user
}

export async function findUserById(id: Id): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, password, created_at AS "createdAt" FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

/* ---------- tenants ---------- */

export async function listTenantsForUser(userId: Id): Promise<Tenant[]> {
  const { rows } = await pool.query<Tenant>(
    `SELECT t.id, t.name, t.created_at AS "createdAt"
       FROM tenants t
       JOIN memberships m ON m.tenant_id = t.id
      WHERE m.user_id = $1`,
    [userId],
  )
  return rows
}

export async function findTenantById(id: Id): Promise<Tenant | null> {
  const { rows } = await pool.query<Tenant>(
    `SELECT id, name, created_at AS "createdAt" FROM tenants WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

/* ---------- memberships ---------- */

export async function findFirstMembershipForUser(
  userId: Id,
): Promise<Membership | null> {
  const { rows } = await pool.query<Membership>(
    `SELECT id, tenant_id AS "tenantId", user_id AS "userId", role
       FROM memberships WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  return rows[0] ?? null
}

/* ---------- sessions ---------- */

export async function createSession(
  token: string,
  userId: Id,
  tenantId: Id,
): Promise<void> {
  await pool.query(
    `INSERT INTO sessions (token, user_id, tenant_id) VALUES ($1, $2, $3)`,
    [token, userId, tenantId],
  )
}

export async function getSession(token: string): Promise<TokenSession | null> {
  const { rows } = await pool.query<TokenSession>(
    `SELECT token, user_id AS "userId", tenant_id AS "tenantId",
            created_at AS "createdAt"
       FROM sessions WHERE token = $1`,
    [token],
  )
  return rows[0] ?? null
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token])
}

/* ---------- workflows ---------- */

export async function listWorkflows(tenantId: Id): Promise<Workflow[]> {
  const { rows } = await pool.query<Workflow>(
    `SELECT id, tenant_id AS "tenantId", name, status,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM workflows WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function findWorkflow(
  tenantId: Id,
  id: Id,
): Promise<Workflow | null> {
  const { rows } = await pool.query<Workflow>(
    `SELECT id, tenant_id AS "tenantId", name, status,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM workflows WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function createWorkflow(
  tenantId: Id,
  name: string,
): Promise<Workflow> {
  const { rows } = await pool.query<Workflow>(
    `INSERT INTO workflows (tenant_id, name, status)
     VALUES ($1, $2, 'draft')
     RETURNING id, tenant_id AS "tenantId", name, status,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name],
  )
  return rows[0]
}

const WF_COLS = `
  id, tenant_id AS "tenantId", name, status, definition,
  created_at AS "createdAt", updated_at AS "updatedAt"
`

export async function findWorkflowWithDefinition(
  tenantId: Id,
  id: Id,
): Promise<Workflow | null> {
  const { rows } = await pool.query<Workflow>(
    `SELECT ${WF_COLS} FROM workflows WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  const row = rows[0]
  if (!row) return null
  if (typeof row.definition === 'string') {
    row.definition = JSON.parse(row.definition)
  }
  return row
}

export async function updateWorkflow(
  tenantId: Id,
  id: Id,
  patch: { name?: string; status?: Workflow['status']; definition?: WorkflowDefinition },
): Promise<Workflow | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`)
    vals.push(patch.name)
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`)
    vals.push(patch.status)
  }
  if (patch.definition !== undefined) {
    sets.push(`definition = $${i++}`)
    vals.push(JSON.stringify(patch.definition))
  }
  if (sets.length === 0) return findWorkflowWithDefinition(tenantId, id)
  sets.push('updated_at = now()')
  vals.push(tenantId, id)
  const { rows } = await pool.query<Workflow>(
    `UPDATE workflows SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING ${WF_COLS}`,
    vals,
  )
  const row = rows[0]
  if (row && typeof row.definition === 'string') {
    row.definition = JSON.parse(row.definition)
  }
  return row ?? null
}

export async function listPublishedWorkflows(tenantId: Id): Promise<Workflow[]> {
  const { rows } = await pool.query<Workflow>(
    `SELECT ${WF_COLS} FROM workflows
      WHERE tenant_id = $1 AND status = 'published'
      ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows.map((row) => {
    if (typeof row.definition === 'string') {
      row.definition = JSON.parse(row.definition)
    }
    return row
  })
}

/* ---------- executions ---------- */

export async function createExecution(input: {
  tenantId: Id
  workflowId: Id
  triggerType: string
  triggerData?: unknown
  parentExecutionId?: Id
}): Promise<Execution> {
  const { rows } = await pool.query<Execution>(
    `INSERT INTO executions (tenant_id, workflow_id, status, trigger_type, trigger_data, parent_execution_id)
     VALUES ($1, $2, 'running', $3, $4, $5)
     RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
               status, trigger_type AS "triggerType", trigger_data AS "triggerData",
               error, started_at AS "startedAt", finished_at AS "finishedAt"`,
    [input.tenantId, input.workflowId, input.triggerType, input.triggerData ?? null, input.parentExecutionId ?? null],
  )
  return rows[0]
}

export async function finishExecution(
  id: Id,
  status: Execution['status'],
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE executions SET status = $2, error = $3, finished_at = now() WHERE id = $1`,
    [id, status, error],
  )
}

export async function createExecutionStep(input: {
  executionId: Id
  nodeId: string
  nodeType: string
  nodeLabel: string
  input?: unknown
}): Promise<ExecutionStep> {
  const { rows } = await pool.query<ExecutionStep>(
    `INSERT INTO execution_steps
       (execution_id, node_id, node_type, node_label, status, input)
     VALUES ($1, $2, $3, $4, 'running', $5)
     RETURNING id, execution_id AS "executionId", node_id AS "nodeId",
               node_type AS "nodeType", node_label AS "nodeLabel", status,
               input, output, error,
               started_at AS "startedAt", finished_at AS "finishedAt"`,
    [input.executionId, input.nodeId, input.nodeType, input.nodeLabel, input.input ?? null],
  )
  return rows[0]
}

export async function finishExecutionStep(
  id: Id,
  status: ExecutionStep['status'],
  output: unknown,
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE execution_steps SET status = $2, output = $3, error = $4, finished_at = now() WHERE id = $1`,
    [id, status, output ?? null, error],
  )
}

export async function listExecutions(
  tenantId: Id,
  opts?: { workflowId?: Id; status?: string; limit?: number },
): Promise<Execution[]> {
  const conds = ['e.tenant_id = $1']
  const vals: unknown[] = [tenantId]
  let i = 2
  if (opts?.workflowId) {
    conds.push(`e.workflow_id = $${i++}`)
    vals.push(opts.workflowId)
  }
  if (opts?.status) {
    conds.push(`e.status = $${i++}`)
    vals.push(opts.status)
  }
  const limit = Math.min(opts?.limit ?? 50, 200)
  vals.push(limit)
  const { rows } = await pool.query<Execution>(
    `SELECT e.id, e.tenant_id AS "tenantId", e.workflow_id AS "workflowId",
            w.name AS "workflowName", e.status, e.trigger_type AS "triggerType",
            e.trigger_data AS "triggerData", e.error,
            e.started_at AS "startedAt", e.finished_at AS "finishedAt"
       FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE ${conds.join(' AND ')}
      ORDER BY e.started_at DESC
      LIMIT $${i}`,
    vals,
  )
  return rows
}

export async function findExecution(
  tenantId: Id,
  id: Id,
): Promise<Execution | null> {
  const { rows } = await pool.query<Execution>(
    `SELECT e.id, e.tenant_id AS "tenantId", e.workflow_id AS "workflowId",
            w.name AS "workflowName", e.status, e.trigger_type AS "triggerType",
            e.trigger_data AS "triggerData", e.error,
            e.started_at AS "startedAt", e.finished_at AS "finishedAt"
       FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE e.tenant_id = $1 AND e.id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function listExecutionSteps(executionId: Id): Promise<ExecutionStep[]> {
  const { rows } = await pool.query<ExecutionStep>(
    `SELECT id, execution_id AS "executionId", node_id AS "nodeId",
            node_type AS "nodeType", node_label AS "nodeLabel", status,
            input, output, error,
            started_at AS "startedAt", finished_at AS "finishedAt"
       FROM execution_steps
      WHERE execution_id = $1
      ORDER BY started_at ASC`,
    [executionId],
  )
  return rows
}

/* ---------- knowledge ---------- */

function chunkText(text: string, size = 500): string[] {
  const chunks: string[] = []
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size))
  }
  return chunks
}

export async function listKnowledgeBases(tenantId: Id): Promise<KnowledgeBase[]> {
  const { rows } = await pool.query<KnowledgeBase>(
    `SELECT kb.id, kb.tenant_id AS "tenantId", kb.name, kb.description,
            COUNT(DISTINCT d.id)::int AS "documentCount",
            COUNT(c.id)::int AS "chunkCount",
            COUNT(c.id) FILTER (WHERE c.embedding_json IS NOT NULL)::int AS "vectorizedChunkCount",
            kb.created_at AS "createdAt", kb.updated_at AS "updatedAt"
       FROM knowledge_bases kb
       LEFT JOIN knowledge_documents d ON d.kbase_id = kb.id
       LEFT JOIN knowledge_chunks c ON c.kbase_id = kb.id
      WHERE kb.tenant_id = $1
      GROUP BY kb.id
      ORDER BY kb.updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function createKnowledgeBase(
  tenantId: Id,
  name: string,
  description?: string,
): Promise<KnowledgeBase> {
  const { rows } = await pool.query<KnowledgeBase>(
    `INSERT INTO knowledge_bases (tenant_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, tenant_id AS "tenantId", name, description,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, description ?? null],
  )
  return rows[0]
}

export async function findKnowledgeBase(tenantId: Id, id: Id): Promise<KnowledgeBase | null> {
  const { rows } = await pool.query<KnowledgeBase>(
    `SELECT id, tenant_id AS "tenantId", name, description,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM knowledge_bases WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function deleteKnowledgeBase(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_bases WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function listKnowledgeDocuments(
  tenantId: Id,
  kbaseId: Id,
): Promise<KnowledgeDocument[]> {
  const { rows } = await pool.query<KnowledgeDocument>(
    `SELECT id, kbase_id AS "kbaseId", tenant_id AS "tenantId",
            title, source_type AS "sourceType", content,
            created_at AS "createdAt"
       FROM knowledge_documents
      WHERE tenant_id = $1 AND kbase_id = $2
      ORDER BY created_at DESC`,
    [tenantId, kbaseId],
  )
  return rows
}

export async function addKnowledgeDocument(
  tenantId: Id,
  kbaseId: Id,
  title: string,
  content: string,
  sourceType = 'text',
): Promise<KnowledgeDocument> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const docRes = await client.query<KnowledgeDocument>(
      `INSERT INTO knowledge_documents (kbase_id, tenant_id, title, source_type, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, kbase_id AS "kbaseId", tenant_id AS "tenantId",
                 title, source_type AS "sourceType", content,
                 created_at AS "createdAt"`,
      [kbaseId, tenantId, title, sourceType, content],
    )
    const doc = docRes.rows[0]
    const parts = chunkText(content)
    for (let idx = 0; idx < parts.length; idx++) {
      await client.query(
        `INSERT INTO knowledge_chunks (document_id, kbase_id, tenant_id, idx, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [doc.id, kbaseId, tenantId, idx, parts[idx]],
      )
    }
    await client.query(
      `UPDATE knowledge_bases SET updated_at = now() WHERE id = $1`,
      [kbaseId],
    )
    await client.query('COMMIT')
    return doc
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function searchKnowledgeChunks(
  tenantId: Id,
  kbaseId: Id,
  query: string,
  limit = 5,
): Promise<KnowledgeChunkHit[]> {
  const q = query.trim()
  if (!q) return []
  const { rows } = await pool.query<KnowledgeChunkHit & { rank: number }>(
    `SELECT c.id, c.content, d.title,
            ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', $3)) AS rank
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1 AND c.kbase_id = $2
        AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $3)
      ORDER BY rank DESC
      LIMIT $4`,
    [tenantId, kbaseId, q, limit],
  )
  if (rows.length) {
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      title: r.title,
      score: Number(r.rank) || 0,
    }))
  }
  const { rows: fallback } = await pool.query<KnowledgeChunkHit>(
    `SELECT c.id, c.content, d.title, 0.1::float AS score
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1 AND c.kbase_id = $2 AND c.content ILIKE $3
      LIMIT $4`,
    [tenantId, kbaseId, `%${q}%`, limit],
  )
  return fallback
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function setChunkEmbedding(
  chunkId: Id,
  embedding: number[],
): Promise<void> {
  await pool.query(
    `UPDATE knowledge_chunks SET embedding_json = $2 WHERE id = $1`,
    [chunkId, JSON.stringify(embedding)],
  )
  try {
    const vec = `[${embedding.join(',')}]`
    await pool.query(`UPDATE knowledge_chunks SET embedding = $2::vector WHERE id = $1`, [chunkId, vec])
  } catch {
    /* pgvector column may not exist */
  }
}

export async function searchKnowledgeChunksVector(
  tenantId: Id,
  kbaseId: Id,
  query: string,
  limit = 5,
): Promise<KnowledgeChunkHit[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const { createEmbedding } = await import('./engine/llm.js')
    const queryVec = await createEmbedding(tenantId, q)
    const vecStr = `[${queryVec.join(',')}]`
    const { rows } = await pool.query<KnowledgeChunkHit & { score: number }>(
      `SELECT c.id, c.content, d.title,
              1 - (c.embedding <=> $3::vector) AS score
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
        WHERE c.tenant_id = $1 AND c.kbase_id = $2 AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $3::vector
        LIMIT $4`,
      [tenantId, kbaseId, vecStr, limit],
    )
    if (rows.length) {
      return rows.map((r) => ({
        id: r.id,
        content: r.content,
        title: r.title,
        score: Number(r.score) || 0,
      }))
    }
  } catch {
    /* fall through to json cosine */
  }

  const { createEmbedding } = await import('./engine/llm.js')
  const queryVec = await createEmbedding(tenantId, q)
  const { rows } = await pool.query<{ id: string; content: string; title: string; embedding_json: number[] }>(
    `SELECT c.id, c.content, d.title, c.embedding_json
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1 AND c.kbase_id = $2 AND c.embedding_json IS NOT NULL`,
    [tenantId, kbaseId],
  )
  return rows
    .map((r) => {
      const emb = Array.isArray(r.embedding_json) ? r.embedding_json : []
      return {
        id: r.id,
        content: r.content,
        title: r.title,
        score: emb.length ? cosineSimilarity(queryVec, emb) : 0,
      }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export type ExecutionJob = {
  id: Id
  tenantId: Id
  workflowId: Id
  triggerType: string
  triggerData?: unknown
  status: 'pending' | 'processing' | 'done' | 'failed'
  executionId?: Id | null
  error?: string | null
  userId?: Id | null
  createdAt: string
}

export type WorkflowTriggerRow = {
  id: Id
  tenantId: Id
  workflowId: Id
  nodeId: string
  type: 'webhook' | 'cron'
  config: Record<string, unknown>
  enabled: boolean
}

export async function enqueueExecutionJob(input: {
  tenantId: Id
  workflowId: Id
  triggerType: string
  triggerData: Record<string, unknown>
  userId?: Id
}): Promise<ExecutionJob> {
  const { rows } = await pool.query<ExecutionJob>(
    `INSERT INTO execution_jobs (tenant_id, workflow_id, trigger_type, trigger_data, user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
               trigger_type AS "triggerType", trigger_data AS "triggerData",
               status, execution_id AS "executionId", error, user_id AS "userId",
               created_at AS "createdAt"`,
    [input.tenantId, input.workflowId, input.triggerType, input.triggerData, input.userId ?? null],
  )
  const job = rows[0]
  void redisPushJob(job.id).catch(() => {})
  return job
}

export async function claimExecutionJobById(id: Id): Promise<ExecutionJob | null> {
  const { rows } = await pool.query<ExecutionJob>(
    `UPDATE execution_jobs SET status = 'processing', started_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
                trigger_type AS "triggerType", trigger_data AS "triggerData",
                status, execution_id AS "executionId", error, user_id AS "userId",
                created_at AS "createdAt"`,
    [id],
  )
  return rows[0] ?? null
}

export async function findExecutionJob(tenantId: Id, id: Id): Promise<ExecutionJob | null> {
  const { rows } = await pool.query<ExecutionJob>(
    `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId",
            trigger_type AS "triggerType", trigger_data AS "triggerData",
            status, execution_id AS "executionId", error, user_id AS "userId",
            created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt"
       FROM execution_jobs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function cancelExecution(tenantId: Id, executionId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE executions SET status = 'cancelled', error = '用户取消', finished_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status = 'running'`,
    [tenantId, executionId],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteWorkflow(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM workflows WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function claimExecutionJob(): Promise<ExecutionJob | null> {
  const { rows } = await pool.query<ExecutionJob>(
    `UPDATE execution_jobs SET status = 'processing', started_at = now()
      WHERE id = (
        SELECT id FROM execution_jobs WHERE status = 'pending'
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
                trigger_type AS "triggerType", trigger_data AS "triggerData",
                status, execution_id AS "executionId", error, user_id AS "userId",
                created_at AS "createdAt"`,
  )
  return rows[0] ?? null
}

export async function finishExecutionJob(
  id: Id,
  status: 'done' | 'failed',
  executionId: Id | null,
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE execution_jobs SET status = $2, execution_id = $3, error = $4, finished_at = now()
      WHERE id = $1`,
    [id, status, executionId, error],
  )
}

export async function clearWorkflowTriggers(tenantId: Id, workflowId: Id): Promise<void> {
  await pool.query(
    `DELETE FROM workflow_triggers WHERE tenant_id = $1 AND workflow_id = $2`,
    [tenantId, workflowId],
  )
}

export async function upsertWorkflowTrigger(input: {
  tenantId: Id
  workflowId: Id
  nodeId: string
  type: 'webhook' | 'cron'
  config: Record<string, unknown>
}): Promise<void> {
  await pool.query(
    `INSERT INTO workflow_triggers (tenant_id, workflow_id, node_id, type, config)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, workflow_id, node_id) DO UPDATE
       SET type = EXCLUDED.type, config = EXCLUDED.config, enabled = true`,
    [input.tenantId, input.workflowId, input.nodeId, input.type, input.config],
  )
}

export async function listAllCronTriggers(): Promise<WorkflowTriggerRow[]> {
  const { rows } = await pool.query<WorkflowTriggerRow>(
    `SELECT wt.id, wt.tenant_id AS "tenantId", wt.workflow_id AS "workflowId",
            wt.node_id AS "nodeId", wt.type, wt.config, wt.enabled
       FROM workflow_triggers wt
       JOIN workflows w ON w.id = wt.workflow_id AND w.status = 'published'
      WHERE wt.type = 'cron' AND wt.enabled = true`,
  )
  return rows
}

export async function findWorkflowByWebhook(
  tenantId: Id,
  path: string,
): Promise<{ workflowId: Id; nodeId: string } | null> {
  const { rows } = await pool.query<{ workflowId: Id; nodeId: string }>(
    `SELECT wt.workflow_id AS "workflowId", wt.node_id AS "nodeId"
       FROM workflow_triggers wt
       JOIN workflows w ON w.id = wt.workflow_id AND w.status = 'published'
      WHERE wt.tenant_id = $1 AND wt.type = 'webhook' AND wt.enabled = true
        AND wt.config->>'path' = $2
      LIMIT 1`,
    [tenantId, path],
  )
  return rows[0] ?? null
}

export async function countVectorizedChunks(tenantId: Id, kbaseId: Id): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM knowledge_chunks
      WHERE tenant_id = $1 AND kbase_id = $2 AND embedding_json IS NOT NULL`,
    [tenantId, kbaseId],
  )
  return rows[0]?.n ?? 0
}

export async function listChunksWithoutEmbedding(
  tenantId: Id,
  documentId: Id,
): Promise<{ id: Id; content: string }[]> {
  const { rows } = await pool.query<{ id: Id; content: string }>(
    `SELECT id, content FROM knowledge_chunks
      WHERE tenant_id = $1 AND document_id = $2 AND embedding_json IS NULL`,
    [tenantId, documentId],
  )
  return rows
}

/* ---------- workflow versions ---------- */

export type WorkflowVersion = {
  id: Id
  tenantId: Id
  workflowId: Id
  version: number
  definition: unknown
  note?: string | null
  createdBy?: Id | null
  createdAt: string
}

export async function getNextWorkflowVersion(workflowId: Id): Promise<number> {
  const { rows } = await pool.query<{ v: string }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM workflow_versions WHERE workflow_id = $1`,
    [workflowId],
  )
  return Number(rows[0]?.v ?? 1)
}

export async function createWorkflowVersion(input: {
  tenantId: Id
  workflowId: Id
  version: number
  definition: unknown
  note?: string
  createdBy?: Id
}): Promise<WorkflowVersion> {
  const { rows } = await pool.query<WorkflowVersion>(
    `INSERT INTO workflow_versions (tenant_id, workflow_id, version, definition, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId", version,
               definition, note, created_by AS "createdBy", created_at AS "createdAt"`,
    [
      input.tenantId,
      input.workflowId,
      input.version,
      JSON.stringify(input.definition),
      input.note ?? null,
      input.createdBy ?? null,
    ],
  )
  return rows[0]
}

export async function listWorkflowVersions(
  tenantId: Id,
  workflowId: Id,
): Promise<WorkflowVersion[]> {
  const { rows } = await pool.query<WorkflowVersion>(
    `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId", version,
            definition, note, created_by AS "createdBy", created_at AS "createdAt"
       FROM workflow_versions
      WHERE tenant_id = $1 AND workflow_id = $2
      ORDER BY version DESC`,
    [tenantId, workflowId],
  )
  return rows
}

export async function findWorkflowVersion(
  tenantId: Id,
  versionId: Id,
): Promise<WorkflowVersion | null> {
  const { rows } = await pool.query<WorkflowVersion>(
    `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId", version,
            definition, note, created_by AS "createdBy", created_at AS "createdAt"
       FROM workflow_versions
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, versionId],
  )
  return rows[0] ?? null
}

/* ---------- chat apps ---------- */

export type ChatApp = {
  id: Id
  tenantId: Id
  name: string
  description?: string | null
  workflowId: Id
  workflowName?: string
  apiKey: string
  status: 'draft' | 'published'
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export async function listChatApps(tenantId: Id): Promise<ChatApp[]> {
  const { rows } = await pool.query<ChatApp>(
    `SELECT a.id, a.tenant_id AS "tenantId", a.name, a.description,
            a.workflow_id AS "workflowId", w.name AS "workflowName",
            a.api_key AS "apiKey", a.status, a.config,
            a.created_at AS "createdAt", a.updated_at AS "updatedAt"
       FROM chat_apps a
       JOIN workflows w ON w.id = a.workflow_id
      WHERE a.tenant_id = $1
      ORDER BY a.updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function createChatApp(
  tenantId: Id,
  name: string,
  workflowId: Id,
  description?: string,
): Promise<ChatApp> {
  const apiKey = `app_${crypto.randomUUID().replace(/-/g, '')}`
  const { rows } = await pool.query<ChatApp>(
    `INSERT INTO chat_apps (tenant_id, name, description, workflow_id, api_key, config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id AS "tenantId", name, description,
               workflow_id AS "workflowId", api_key AS "apiKey", status, config,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, description ?? null, workflowId, apiKey, { welcome: '你好，有什么可以帮您？' }],
  )
  return rows[0]
}

export async function findChatApp(tenantId: Id, id: Id): Promise<ChatApp | null> {
  const { rows } = await pool.query<ChatApp>(
    `SELECT id, tenant_id AS "tenantId", name, description,
            workflow_id AS "workflowId", api_key AS "apiKey", status, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_apps WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function findChatAppByApiKey(apiKey: string): Promise<ChatApp | null> {
  const { rows } = await pool.query<ChatApp>(
    `SELECT id, tenant_id AS "tenantId", name, description,
            workflow_id AS "workflowId", api_key AS "apiKey", status, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_apps WHERE api_key = $1 AND status = 'published'`,
    [apiKey],
  )
  return rows[0] ?? null
}

export async function updateChatApp(
  tenantId: Id,
  id: Id,
  patch: {
    name?: string
    description?: string
    workflowId?: Id
    status?: ChatApp['status']
    config?: Record<string, unknown>
  },
): Promise<ChatApp | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name) }
  if (patch.description !== undefined) { sets.push(`description = $${i++}`); vals.push(patch.description) }
  if (patch.workflowId !== undefined) { sets.push(`workflow_id = $${i++}`); vals.push(patch.workflowId) }
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status) }
  if (patch.config !== undefined) { sets.push(`config = $${i++}`); vals.push(patch.config) }
  if (!sets.length) return findChatApp(tenantId, id)
  sets.push('updated_at = now()')
  vals.push(tenantId, id)
  const { rows } = await pool.query<ChatApp>(
    `UPDATE chat_apps SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING id, tenant_id AS "tenantId", name, description,
                workflow_id AS "workflowId", api_key AS "apiKey", status, config,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    vals,
  )
  return rows[0] ?? null
}

export async function deleteChatApp(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_apps WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

/* ---------- connectors ---------- */

export async function listConnectors(tenantId: Id): Promise<Connector[]> {
  const { rows } = await pool.query<Connector>(
    `SELECT id, tenant_id AS "tenantId", name, type, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM connectors WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function createConnector(
  tenantId: Id,
  name: string,
  type: Connector['type'],
  config: Record<string, unknown>,
): Promise<Connector> {
  const { rows } = await pool.query<Connector>(
    `INSERT INTO connectors (tenant_id, name, type, config)
     VALUES ($1, $2, $3, $4)
     RETURNING id, tenant_id AS "tenantId", name, type, config,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, type, config],
  )
  return rows[0]
}

export async function updateConnector(
  tenantId: Id,
  id: Id,
  patch: { name?: string; config?: Record<string, unknown> },
): Promise<Connector | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`)
    vals.push(patch.name)
  }
  if (patch.config !== undefined) {
    sets.push(`config = $${i++}`)
    vals.push(patch.config)
  }
  if (!sets.length) return findConnector(tenantId, id)
  sets.push('updated_at = now()')
  vals.push(tenantId, id)
  const { rows } = await pool.query<Connector>(
    `UPDATE connectors SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING id, tenant_id AS "tenantId", name, type, config,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    vals,
  )
  return rows[0] ?? null
}

export async function findConnector(tenantId: Id, id: Id): Promise<Connector | null> {
  const { rows } = await pool.query<Connector>(
    `SELECT id, tenant_id AS "tenantId", name, type, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM connectors WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function deleteConnector(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM connectors WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

/* ---------- audit & admin ---------- */

export async function insertAuditLog(input: {
  tenantId: Id
  userId?: Id | null
  action: string
  resourceType: string
  resourceId?: string
  detail?: unknown
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.tenantId,
      input.userId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.detail ?? null,
    ],
  )
}

export async function listAuditLogs(tenantId: Id, limit = 50): Promise<AuditLog[]> {
  const { rows } = await pool.query<AuditLog>(
    `SELECT a.id, a.tenant_id AS "tenantId", a.user_id AS "userId",
            u.email AS "userEmail", a.action, a.resource_type AS "resourceType",
            a.resource_id AS "resourceId", a.detail,
            a.created_at AS "createdAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [tenantId, Math.min(limit, 200)],
  )
  return rows
}

export async function listTenantMembers(tenantId: Id): Promise<TenantMember[]> {
  const { rows } = await pool.query<TenantMember>(
    `SELECT m.id AS "membershipId", m.user_id AS "userId", u.email,
            m.role, u.created_at AS "createdAt"
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = $1
      ORDER BY u.created_at ASC`,
    [tenantId],
  )
  return rows
}

export async function createTenantMember(
  tenantId: Id,
  email: string,
  password: string,
  role: Membership['role'],
): Promise<TenantMember> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let userId: string
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1)`,
      [email],
    )
    if (existing.rows[0]) {
      userId = existing.rows[0].id
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id`,
        [email, password],
      )
      userId = ins.rows[0].id
    }
    const dup = await client.query(
      `SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    )
    if (dup.rows[0]) {
      throw new Error('用户已是该租户成员')
    }
    const mem = await client.query<TenantMember>(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id AS "membershipId", user_id AS "userId",
                 $4::text AS email, role, now() AS "createdAt"`,
      [tenantId, userId, role, email],
    )
    await client.query('COMMIT')
    return mem.rows[0]
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function updateMemberRole(
  tenantId: Id,
  membershipId: Id,
  role: Membership['role'],
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE memberships SET role = $3 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, membershipId, role],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteTenantMember(tenantId: Id, membershipId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM memberships WHERE tenant_id = $1 AND id = $2`,
    [tenantId, membershipId],
  )
  return (rowCount ?? 0) > 0
}

export async function getMembershipRole(
  userId: Id,
  tenantId: Id,
): Promise<Membership['role'] | null> {
  const { rows } = await pool.query<{ role: Membership['role'] }>(
    `SELECT role FROM memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  )
  return rows[0]?.role ?? null
}

/* ---------- dashboard ---------- */

export async function getDashboardStats(tenantId: Id): Promise<DashboardStats> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [execRes, msgRes, aiRes, failRes] = await Promise.all([
    pool.query<{ total: string; success: string; failed: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'success')::text AS success,
              COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
         FROM executions
        WHERE tenant_id = $1 AND started_at >= $2`,
      [tenantId, todayStart.toISOString()],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM messages
        WHERE tenant_id = $1 AND created_at >= $2`,
      [tenantId, todayStart.toISOString()],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM execution_steps
        WHERE node_type IN ('ai.chat', 'ai.knowledge')
          AND started_at >= $2
          AND execution_id IN (SELECT id FROM executions WHERE tenant_id = $1)`,
      [tenantId, todayStart.toISOString()],
    ),
    pool.query<{ workflow_name: string; reason: string; count: string }>(
      `SELECT w.name AS workflow_name,
              COALESCE(e.error, '未知') AS reason,
              COUNT(*)::text AS count
         FROM executions e
         JOIN workflows w ON w.id = e.workflow_id
        WHERE e.tenant_id = $1 AND e.status = 'failed'
          AND e.started_at >= now() - interval '24 hours'
        GROUP BY w.name, e.error
        ORDER BY COUNT(*) DESC
        LIMIT 5`,
      [tenantId],
    ),
  ])

  const total = Number(execRes.rows[0]?.total ?? 0)
  const success = Number(execRes.rows[0]?.success ?? 0)
  const failed = Number(execRes.rows[0]?.failed ?? 0)

  return {
    executionsToday: total,
    successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 100,
    alertsToday: failed,
    messagesToday: Number(msgRes.rows[0]?.count ?? 0),
    aiCallsToday: Number(aiRes.rows[0]?.count ?? 0),
    failureTop: failRes.rows.map((r) => ({
      workflowName: r.workflow_name,
      reason: r.reason,
      count: Number(r.count),
    })),
  }
}

/* ---------- conversations ---------- */

export async function listConversations(tenantId: Id): Promise<Conversation[]> {
  const { rows } = await pool.query<Conversation>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            kind, title, updated_at AS "updatedAt"
       FROM conversations WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function upsertConversation(
  tenantId: Id,
  channel: 'wecom' | 'feishu',
  externalId: string,
  kind: 'group' | 'direct',
  title: string,
): Promise<Conversation> {
  const { rows } = await pool.query<Conversation>(
    `INSERT INTO conversations (tenant_id, channel, external_id, kind, title)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, channel, external_id) DO UPDATE
       SET kind = EXCLUDED.kind,
           title = EXCLUDED.title,
           updated_at = now()
     RETURNING id, tenant_id AS "tenantId", channel, external_id AS "externalId",
               kind, title, updated_at AS "updatedAt"`,
    [tenantId, channel, externalId, kind, title],
  )
  return rows[0]
}

export async function findConversationByExternalId(
  tenantId: Id,
  channel: 'wecom' | 'feishu',
  externalId: string,
): Promise<Conversation | null> {
  const { rows } = await pool.query<Conversation>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            kind, title, updated_at AS "updatedAt"
       FROM conversations
      WHERE tenant_id = $1 AND channel = $2 AND external_id = $3`,
    [tenantId, channel, externalId],
  )
  return rows[0] ?? null
}

/* ---------- messages ---------- */

export async function insertMessage(
  tenantId: Id,
  conversationId: Id,
  direction: 'in' | 'out',
  senderId: string,
  content: string,
  raw?: unknown,
  senderName?: string,
): Promise<Message> {
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages
        (tenant_id, conversation_id, direction, sender_id, sender_name, content, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tenant_id AS "tenantId", conversation_id AS "conversationId",
               direction, sender_id AS "senderId", sender_name AS "senderName",
               content, created_at AS "createdAt", raw`,
    [tenantId, conversationId, direction, senderId, senderName ?? null, content, raw ?? null],
  )
  return rows[0]
}

export async function listMessages(
  tenantId: Id,
  conversationId: Id,
): Promise<Message[]> {
  const { rows } = await pool.query<Message>(
    `SELECT id, tenant_id AS "tenantId", conversation_id AS "conversationId",
            direction, sender_id AS "senderId", sender_name AS "senderName",
            content, created_at AS "createdAt", raw
       FROM messages
      WHERE tenant_id = $1 AND conversation_id = $2
      ORDER BY created_at ASC`,
    [tenantId, conversationId],
  )
  return rows
}

/* ---------- channel configs ---------- */

export async function getChannelConfig(
  tenantId: Id,
): Promise<ChannelConfig | null> {
  const { rows } = await pool.query<{
    tenantId: string
    wecom: WecomChannelConfig | null
    feishu: FeishuChannelConfig | null
  }>(
    `SELECT tenant_id AS "tenantId", wecom, feishu
       FROM channel_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return { tenantId: rows[0].tenantId, wecom: rows[0].wecom ?? undefined, feishu: rows[0].feishu ?? undefined }
}

export async function upsertWecomConfig(
  tenantId: Id,
  cfg: WecomChannelConfig,
): Promise<void> {
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, wecom)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET wecom = EXCLUDED.wecom`,
    [tenantId, cfg],
  )
}

export async function upsertFeishuConfig(
  tenantId: Id,
  cfg: FeishuChannelConfig,
): Promise<void> {
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, feishu)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET feishu = EXCLUDED.feishu`,
    [tenantId, cfg],
  )
}

/* ---------- chat sessions ---------- */

export async function getOrCreateChatSession(input: {
  tenantId: Id
  appId: Id
  externalUser?: string
}): Promise<{ id: Id }> {
  if (input.externalUser) {
    const { rows } = await pool.query<{ id: Id }>(
      `SELECT id FROM chat_sessions
        WHERE tenant_id = $1 AND app_id = $2 AND external_user = $3
        ORDER BY updated_at DESC LIMIT 1`,
      [input.tenantId, input.appId, input.externalUser],
    )
    if (rows[0]) return rows[0]
  }
  const { rows } = await pool.query<{ id: Id }>(
    `INSERT INTO chat_sessions (tenant_id, app_id, external_user)
     VALUES ($1, $2, $3) RETURNING id`,
    [input.tenantId, input.appId, input.externalUser ?? null],
  )
  return rows[0]
}

export async function insertChatMessage(input: {
  sessionId: Id
  role: 'user' | 'assistant' | 'system'
  content: string
  executionId?: Id
}): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, execution_id) VALUES ($1, $2, $3, $4)`,
    [input.sessionId, input.role, input.content, input.executionId ?? null],
  )
  await pool.query(`UPDATE chat_sessions SET updated_at = now() WHERE id = $1`, [input.sessionId])
}

export async function listChatSessions(tenantId: Id, appId: Id) {
  const { rows } = await pool.query(
    `SELECT id, external_user AS "externalUser", title, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_sessions WHERE tenant_id = $1 AND app_id = $2 ORDER BY updated_at DESC LIMIT 100`,
    [tenantId, appId],
  )
  return rows
}

export async function listChatMessages(sessionId: Id) {
  const { rows } = await pool.query(
    `SELECT id, role, content, execution_id AS "executionId", created_at AS "createdAt"
       FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  )
  return rows
}

export async function updateConversationStatus(
  tenantId: Id,
  conversationId: Id,
  status: 'open' | 'pending' | 'resolved',
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE conversations SET status = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
    [tenantId, conversationId, status],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteKnowledgeDocument(tenantId: Id, docId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_documents WHERE tenant_id = $1 AND id = $2`,
    [tenantId, docId],
  )
  return (rowCount ?? 0) > 0
}

/* ---------- in-memory caches (token caches) ---------- */

const wecomAccessTokenCache = new Map<Id, CachedToken>()
const feishuTenantTokenCache = new Map<Id, CachedToken>()

/* ---------- exported db facade (kept for minimal route diff) ---------- */

export const db = {
  nowIso,
  id: newId,
  // session helpers
  createSession,
  getSession,
  deleteSession,
  // user helpers
  findUserByEmailAndPassword,
  findUserById,
  // tenant helpers
  findTenantById,
  listTenantsForUser,
  // membership helpers
  findFirstMembershipForUser,
  // workflow helpers
  listWorkflows,
  findWorkflow,
  findWorkflowWithDefinition,
  createWorkflow,
  updateWorkflow,
  listPublishedWorkflows,
  // execution helpers
  createExecution,
  finishExecution,
  createExecutionStep,
  finishExecutionStep,
  listExecutions,
  findExecution,
  listExecutionSteps,
  // knowledge helpers
  listKnowledgeBases,
  createKnowledgeBase,
  findKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeDocuments,
  addKnowledgeDocument,
  searchKnowledgeChunks,
  // connector helpers
  listConnectors,
  createConnector,
  updateConnector,
  findConnector,
  deleteConnector,
  // audit & admin
  insertAuditLog,
  listAuditLogs,
  listTenantMembers,
  createTenantMember,
  updateMemberRole,
  deleteTenantMember,
  getMembershipRole,
  getDashboardStats,
  setChunkEmbedding,
  searchKnowledgeChunksVector,
  countVectorizedChunks,
  listChunksWithoutEmbedding,
  enqueueExecutionJob,
  claimExecutionJob,
  claimExecutionJobById,
  findExecutionJob,
  cancelExecution,
  deleteWorkflow,
  hashPassword,
  getOrCreateChatSession,
  insertChatMessage,
  listChatSessions,
  listChatMessages,
  updateConversationStatus,
  deleteKnowledgeDocument,
  finishExecutionJob,
  clearWorkflowTriggers,
  upsertWorkflowTrigger,
  listAllCronTriggers,
  findWorkflowByWebhook,
  getNextWorkflowVersion,
  createWorkflowVersion,
  listWorkflowVersions,
  findWorkflowVersion,
  listChatApps,
  createChatApp,
  findChatApp,
  findChatAppByApiKey,
  updateChatApp,
  deleteChatApp,
  // conversation helpers
  listConversations,
  upsertConversation,
  findConversationByExternalId,
  // message helpers
  insertMessage,
  listMessages,
  // channel helpers
  getChannelConfig,
  upsertWecomConfig,
  upsertFeishuConfig,
  // llm provider helpers
  listProviders,
  findProvider,
  getProviderSecret,
  insertProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider,
  // caches
  wecomAccessTokenCache,
  feishuTenantTokenCache,
}
