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

export type TaobaoChannelConfig = {
  appKey: string
  appSecret: string
  session: string
  sellerNick: string
  tmcGroup: string
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

export type Credential = {
  id: Id
  tenantId: Id
  name: string
  type: 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'custom'
  data: Record<string, unknown>
  maskedPreview: string
  createdAt: string
  updatedAt: string
}

export type OAuthState = {
  id: Id
  credentialId: Id
  state: string
  redirectUri: string
  extra: Record<string, unknown>
  expiresAt: string
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
  isDefaultEmbedding: boolean
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
  is_default_embedding AS "isDefaultEmbedding",
  created_at AS "createdAt", updated_at AS "updatedAt"
`

export async function listProviders(tenantId: Id): Promise<LlmProvider[]> {
  const { rows } = await pool.query<LlmProvider>(
    `SELECT ${PROVIDER_COLS} FROM llm_providers WHERE tenant_id = $1 ORDER BY is_default DESC, is_default_embedding DESC, created_at ASC`,
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
  isDefaultEmbedding?: boolean
}): Promise<LlmProvider> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = encryptSecret(input.apiKey)
  const { rows } = await pool.query<LlmProvider>(
    `INSERT INTO llm_providers
       (tenant_id, name, base_url, api_key_iv, api_key_tag, api_key_ciphertext,
        api_key_masked, default_chat_model, default_embedding_model, is_default, is_default_embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
      input.isDefaultEmbedding ?? false,
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
  isDefault?: boolean
  isDefaultEmbedding?: boolean
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
  if (input.isDefaultEmbedding !== undefined) push('is_default_embedding', input.isDefaultEmbedding)
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

export async function setDefaultEmbeddingProvider(tenantId: Id, id: Id): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE llm_providers SET is_default_embedding = false, updated_at = now() WHERE tenant_id = $1`,
      [tenantId],
    )
    await client.query(
      `UPDATE llm_providers SET is_default_embedding = true, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
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

export async function findUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, password, created_at AS "createdAt" FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  return rows[0] ?? null
}

export async function createUser(email: string, hashedPassword: string): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, password, created_at AS "createdAt"`,
    [email.toLowerCase(), hashedPassword],
  )
  return rows[0]
}

/* ---------- tenants ---------- */

export async function createTenant(name: string): Promise<Tenant> {
  const { rows } = await pool.query<Tenant>(
    `INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"`,
    [name],
  )
  return rows[0]
}

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

export async function createMembership(input: {
  tenantId: Id; userId: Id; role: Membership['role']
}): Promise<Membership> {
  const { rows } = await pool.query<Membership>(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
     RETURNING id, tenant_id AS "tenantId", user_id AS "userId", role`,
    [input.tenantId, input.userId, input.role],
  )
  return rows[0]
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

export async function deleteAllSessionsForUser(userId: Id): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId])
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

function chunkText(text: string, size = 500, overlap = 50): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  const paragraphs = clean.split(/\n{2,}/).filter(Boolean)
  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= size) {
      chunks.push(para)
      continue
    }

    const sentences = para.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
    let current = ''
    for (const s of sentences) {
      if (current.length + s.length > size && current.length > 0) {
        chunks.push(current.trim())
        current = s
      } else {
        current += (current ? '' : '') + s
      }
    }
    if (current.trim()) chunks.push(current.trim())
  }

  if (overlap > 0 && chunks.length > 1) {
    const overlapped: string[] = [chunks[0]]
    for (let i = 1; i < chunks.length; i++) {
      const prev = overlapped[overlapped.length - 1]
      const next = chunks[i]
      const overlapText = prev.slice(-overlap)
      overlapped.push(overlapText + next)
    }
    return overlapped
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

export async function searchKnowledgeChunksHybrid(
  tenantId: Id,
  kbaseId: Id,
  query: string,
  limit = 5,
  vectorWeight = 0.7,
): Promise<KnowledgeChunkHit[]> {
  const q = query.trim()
  if (!q) return []

  const [vectorHits, keywordHits] = await Promise.all([
    searchKnowledgeChunksVector(tenantId, kbaseId, q, limit * 2).catch(() => []),
    searchKnowledgeChunks(tenantId, kbaseId, q, limit * 2),
  ])

  if (!vectorHits.length && !keywordHits.length) return []
  if (!vectorHits.length) return keywordHits.slice(0, limit)
  if (!keywordHits.length) return vectorHits.slice(0, limit)

  const scoreMap = new Map<string, { chunk: KnowledgeChunkHit; vector: number; keyword: number }>()
  const k = 60

  for (const [rank, hit] of vectorHits.entries()) {
    scoreMap.set(hit.id, { chunk: hit, vector: 1 / (k + rank + 1), keyword: 0 })
  }
  for (const [rank, hit] of keywordHits.entries()) {
    const entry = scoreMap.get(hit.id)
    if (entry) {
      entry.keyword = 1 / (k + rank + 1)
    } else {
      scoreMap.set(hit.id, { chunk: hit, vector: 0, keyword: 1 / (k + rank + 1) })
    }
  }

  return [...scoreMap.values()]
    .map(({ chunk, vector, keyword }) => ({
      ...chunk,
      score: vectorWeight * vector + (1 - vectorWeight) * keyword,
    }))
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
  const { encryptSecret, decryptSecret } = await import('./crypto.js')
  const result: ChannelConfig = { tenantId: rows[0].tenantId }
  if (rows[0].wecom) {
    const w = rows[0].wecom
    try { if (w.secret.startsWith('enc:')) w.secret = decryptSecret(decodeEnc(w.secret)) } catch {}
    try { if (w.encodingAESKey.startsWith('enc:')) w.encodingAESKey = decryptSecret(decodeEnc(w.encodingAESKey)) } catch {}
    result.wecom = w
  }
  if (rows[0].feishu) {
    const f = rows[0].feishu
    try { if (f.appSecret.startsWith('enc:')) f.appSecret = decryptSecret(decodeEnc(f.appSecret)) } catch {}
    try { if (f.encryptKey?.startsWith('enc:')) f.encryptKey = decryptSecret(decodeEnc(f.encryptKey)) } catch {}
    result.feishu = f
  }
  return result
}

function encodeEnc(iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  return 'enc:' + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

function decodeEnc(val: string): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const buf = Buffer.from(val.slice(4), 'base64')
  return { iv: buf.subarray(0, 12), tag: buf.subarray(12, 28), ciphertext: buf.subarray(28) }
}

export async function upsertWecomConfig(
  tenantId: Id,
  cfg: WecomChannelConfig,
): Promise<void> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = { ...cfg }
  if (enc.secret && !enc.secret.startsWith('enc:')) {
    const e = encryptSecret(enc.secret)
    enc.secret = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  if (enc.encodingAESKey && !enc.encodingAESKey.startsWith('enc:')) {
    const e = encryptSecret(enc.encodingAESKey)
    enc.encodingAESKey = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, wecom)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET wecom = EXCLUDED.wecom`,
    [tenantId, JSON.stringify(enc)],
  )
}

export async function upsertFeishuConfig(
  tenantId: Id,
  cfg: FeishuChannelConfig,
): Promise<void> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = { ...cfg }
  if (enc.appSecret && !enc.appSecret.startsWith('enc:')) {
    const e = encryptSecret(enc.appSecret)
    enc.appSecret = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  if (enc.encryptKey && !enc.encryptKey.startsWith('enc:')) {
    const e = encryptSecret(enc.encryptKey)
    enc.encryptKey = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, feishu)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET feishu = EXCLUDED.feishu`,
    [tenantId, JSON.stringify(enc)],
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
  deleteAllSessionsForUser,
  // user helpers
  findUserByEmailAndPassword,
  findUserById,
  findUserByEmail,
  createUser,
  // tenant helpers
  findTenantById,
  listTenantsForUser,
  createTenant,
  // membership helpers
  findFirstMembershipForUser,
  createMembership,
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
  searchKnowledgeChunksHybrid,
  countVectorizedChunks,
  listChunksWithoutEmbedding,
  enqueueExecutionJob,
  claimExecutionJob,
  claimExecutionJobById,
  findExecutionJob,
  cancelExecution,
  deleteWorkflow,
  hashPassword,
  verifyPassword,
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
  setDefaultEmbeddingProvider,
  // credential helpers
  createCredential,
  updateCredential,
  listCredentials,
  findCredential,
  deleteCredential,
  getDecryptedCredential,
  createOAuthState,
  findOAuthStateByState,
  deleteOAuthState,
  // caches
  wecomAccessTokenCache,
  feishuTenantTokenCache,
}

/* ---------- credential helpers ---------- */

export async function createCredential(
  tenantId: Id,
  input: { name: string; type: Credential['type']; data: Record<string, unknown> },
): Promise<Credential> {
  const { encryptCredentialData, buildMaskedPreview } = await import('./credential.js')
  const encrypted = encryptCredentialData(input.type, input.data)
  const maskedPreview = buildMaskedPreview(input.type, input.data)
  const { rows } = await pool.query<Credential>(
    `INSERT INTO credentials (tenant_id, name, type, data, masked_preview)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, input.name, input.type, JSON.stringify(encrypted), maskedPreview],
  )
  return rows[0]
}

export async function updateCredential(
  tenantId: Id,
  id: Id,
  input: { name?: string; data?: Record<string, unknown> },
): Promise<Credential | null> {
  const existing = await findCredential(tenantId, id)
  if (!existing) return null

  const name = input.name ?? existing.name
  let data = existing.data

  if (input.data) {
    const { encryptCredentialData, buildMaskedPreview } = await import('./credential.js')
    const existingData = { ...existing.data, ...input.data }
    data = encryptCredentialData(existing.type, existingData)
    const { rows: updated } = await pool.query<Credential>(
      `UPDATE credentials SET name = $1, data = $2, masked_preview = $3, updated_at = now()
       WHERE id = $4 AND tenant_id = $5
       RETURNING id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, JSON.stringify(data), buildMaskedPreview(existing.type, existingData), id, tenantId],
    )
    return updated[0] ?? null
  }

  const { rows } = await pool.query<Credential>(
    `UPDATE credentials SET name = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, id, tenantId],
  )
  return rows[0] ?? null
}

export async function listCredentials(tenantId: Id): Promise<Credential[]> {
  const { rows } = await pool.query<Credential>(
    `SELECT id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM credentials WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  )
  return rows
}

export async function findCredential(tenantId: Id, id: Id): Promise<Credential | null> {
  const { rows } = await pool.query<Credential>(
    `SELECT id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM credentials WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  return rows[0] ?? null
}

export async function deleteCredential(tenantId: Id, id: Id): Promise<void> {
  await pool.query(`DELETE FROM credentials WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
}

export async function getDecryptedCredential(
  tenantId: Id,
  id: Id,
): Promise<Credential | null> {
  const cred = await findCredential(tenantId, id)
  if (!cred) return null
  const { decryptCredentialData } = await import('./credential.js')
  cred.data = decryptCredentialData(cred.type, cred.data)
  return cred
}

export async function createOAuthState(input: {
  credentialId: Id
  state: string
  redirectUri: string
  extra?: Record<string, unknown>
  ttlSeconds?: number
}): Promise<OAuthState> {
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 600) * 1000).toISOString()
  const { rows } = await pool.query<OAuthState>(
    `INSERT INTO credential_oauth_states (credential_id, state, redirect_uri, extra, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, credential_id AS "credentialId", state, redirect_uri AS "redirectUri",
               extra, expires_at AS "expiresAt", created_at AS "createdAt"`,
    [input.credentialId, input.state, input.redirectUri, JSON.stringify(input.extra ?? {}), expiresAt],
  )
  return rows[0]
}

export async function findOAuthStateByState(state: string): Promise<OAuthState | null> {
  const { rows } = await pool.query<OAuthState>(
    `SELECT id, credential_id AS "credentialId", state, redirect_uri AS "redirectUri",
            extra, expires_at AS "expiresAt", created_at AS "createdAt"
     FROM credential_oauth_states WHERE state = $1 AND expires_at > now()`,
    [state],
  )
  return rows[0] ?? null
}

export async function deleteOAuthState(state: string): Promise<void> {
  await pool.query(`DELETE FROM credential_oauth_states WHERE state = $1`, [state])
}

/* ---------- taobao helpers ---------- */

export async function getTaobaoConfig(
  tenantId: Id,
): Promise<TaobaoChannelConfig | null> {
  const { rows } = await pool.query<{
    tenantId: string
    appKey: string
    appSecret: string
    session: string
    sellerNick: string
    tmcGroup: string
  }>(
    `SELECT tenant_id AS "tenantId", app_key AS "appKey", app_secret AS "appSecret", session, seller_nick AS "sellerNick", tmc_group AS "tmcGroup"
       FROM taobao_channel_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return {
    appKey: rows[0].appKey,
    appSecret: rows[0].appSecret,
    session: rows[0].session,
    sellerNick: rows[0].sellerNick,
    tmcGroup: rows[0].tmcGroup,
  }
}

export async function upsertTaobaoConfig(
  tenantId: Id,
  cfg: TaobaoChannelConfig,
): Promise<void> {
  await pool.query(
    `INSERT INTO taobao_channel_configs (tenant_id, app_key, app_secret, session, seller_nick, tmc_group)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET
       app_key = EXCLUDED.app_key,
       app_secret = EXCLUDED.app_secret,
       session = EXCLUDED.session,
       seller_nick = EXCLUDED.seller_nick,
       tmc_group = EXCLUDED.tmc_group`,
    [tenantId, cfg.appKey, cfg.appSecret, cfg.session, cfg.sellerNick, cfg.tmcGroup],
  )
}


/* ---------- store profile helpers ---------- */

export interface StoreProfileRow {
  tenantId: string
  industry: string
  name: string
  slogan: string
  address: string
  landmark: string
  parking: string
  phone: string
  wechat: string
  hoursLunch: string
  hoursDinner: string
  hoursWeekend: string
  holidayNote: string
  avgPrice: string
  currentPromotions: Array<{ title: string; detail: string }>
  features: string[]
}

export async function getStoreProfile(tenantId: Id): Promise<StoreProfileRow | null> {
  const { rows } = await pool.query<StoreProfileRow>(
    `SELECT tenant_id AS "tenantId", industry, name, slogan, address, landmark, parking,
            phone, wechat, hours_lunch AS "hoursLunch", hours_dinner AS "hoursDinner",
            hours_weekend AS "hoursWeekend", holiday_note AS "holidayNote",
            avg_price AS "avgPrice", current_promotions AS "currentPromotions",
            features
     FROM store_profiles WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return rows[0]
}


/* ---------- bot assistant helpers ---------- */

export type BotScenarioRow = {
  id: string
  tenantId: string | null
  industry: string
  name: string
  description: string
  icon: string
  steps: unknown[]
  workflowId: string | null
  isBuiltin: boolean
  isActive: boolean
}

export type BotConfigRow = {
  id: string
  tenantId: string
  name: string
  greeting: string
  activeScenarios: string[]
  notifyAdmins: string[]
  autoReply: boolean
}

export type BotSessionRow = {
  id: string
  tenantId: string
  channel: string
  externalId: string
  step: number
  scenarioId: string | null
  params: Record<string, string>
  state: string
  createdAt: string
  updatedAt: string
}

export type BotMessageRow = {
  id: string
  tenantId: string
  sessionId: string
  direction: string
  senderId: string
  content: string
  createdAt: string
}

export async function getBotConfig(tenantId: Id): Promise<BotConfigRow | null> {
  const { rows } = await pool.query<BotConfigRow>(
    `SELECT id, tenant_id AS "tenantId", name, greeting,
            active_scenarios AS "activeScenarios",
            notify_admins AS "notifyAdmins",
            auto_reply AS "autoReply"
     FROM bot_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    activeScenarios: rows[0].activeScenarios ?? [],
    notifyAdmins: rows[0].notifyAdmins ?? [],
  }
}

export async function upsertBotConfig(tenantId: Id, cfg: {
  name: string
  greeting: string
  activeScenarios: string[]
  notifyAdmins: string[]
  autoReply: boolean
}): Promise<void> {
  await pool.query(
    `INSERT INTO bot_configs (tenant_id, name, greeting, active_scenarios, notify_admins, auto_reply)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET
       name = EXCLUDED.name,
       greeting = EXCLUDED.greeting,
       active_scenarios = EXCLUDED.active_scenarios,
       notify_admins = EXCLUDED.notify_admins,
       auto_reply = EXCLUDED.auto_reply,
       updated_at = now()`,
    [tenantId, cfg.name, cfg.greeting, cfg.activeScenarios, cfg.notifyAdmins, cfg.autoReply],
  )
}

export async function getBotSession(
  tenantId: Id,
  channel: string,
  externalId: string,
): Promise<BotSessionRow | null> {
  const { rows } = await pool.query<BotSessionRow>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            step, scenario_id AS "scenarioId", params, state,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM bot_sessions
     WHERE tenant_id = $1 AND channel = $2 AND external_id = $3`,
    [tenantId, channel, externalId],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    params: (rows[0].params as Record<string, string>) ?? {},
  }
}

export async function createBotSession(
  tenantId: Id,
  channel: string,
  externalId: string,
): Promise<BotSessionRow> {
  const { rows } = await pool.query<BotSessionRow>(
    `INSERT INTO bot_sessions (tenant_id, channel, external_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, channel, external_id) DO UPDATE SET updated_at = now()
     RETURNING id, tenant_id AS "tenantId", channel, external_id AS "externalId",
               step, scenario_id AS "scenarioId", params, state,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, channel, externalId],
  )
  return {
    ...rows[0],
    params: (rows[0].params as Record<string, string>) ?? {},
  }
}

export async function updateBotSession(
  sessionId: string,
  patch: { state?: string; step?: number; scenarioId?: string; params?: Record<string, string> },
): Promise<void> {
  const sets: string[] = ['updated_at = now()']
  const vals: unknown[] = [sessionId]
  let idx = 2
  if (patch.state !== undefined) { sets.push(`state = $${idx++}`); vals.push(patch.state) }
  if (patch.step !== undefined) { sets.push(`step = $${idx++}`); vals.push(patch.step) }
  if (patch.scenarioId !== undefined) { sets.push(`scenario_id = $${idx++}`); vals.push(patch.scenarioId) }
  if (patch.params !== undefined) { sets.push(`params = $${idx++}`); vals.push(JSON.stringify(patch.params)) }
  await pool.query(
    `UPDATE bot_sessions SET ${sets.join(', ')} WHERE id = $1`,
    vals,
  )
}

export async function getTenantBotScenarios(tenantId: Id): Promise<BotScenarioRow[]> {
  const { rows } = await pool.query<BotScenarioRow>(
    `SELECT id, tenant_id AS "tenantId", industry, name, description, icon,
            steps, workflow_id AS "workflowId",
            is_builtin AS "isBuiltin", is_active AS "isActive"
     FROM bot_scenarios
     WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  )
  return rows
}

export async function listBotSessions(tenantId: Id): Promise<BotSessionRow[]> {
  const { rows } = await pool.query<BotSessionRow>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            step, scenario_id AS "scenarioId", params, state,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM bot_sessions WHERE tenant_id = $1
     ORDER BY updated_at DESC LIMIT 50`,
    [tenantId],
  )
  return rows.map(r => ({ ...r, params: (r.params as Record<string, string>) ?? {} }))
}

export async function getBotMessages(tenantId: Id, sessionId: string): Promise<BotMessageRow[]> {
  const { rows } = await pool.query<BotMessageRow>(
    `SELECT id, tenant_id AS "tenantId", session_id AS "sessionId",
            direction, sender_id AS "senderId", content,
            created_at AS "createdAt"
     FROM bot_messages WHERE tenant_id = $1 AND session_id = $2
     ORDER BY created_at ASC`,
    [tenantId, sessionId],
  )
  return rows
}

export async function insertBotMessage(
  tenantId: Id,
  sessionId: string,
  direction: string,
  senderId: string,
  content: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO bot_messages (tenant_id, session_id, direction, sender_id, content)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, sessionId, direction, senderId, content],
  )
}

