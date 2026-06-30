import { Router, type Response } from 'express'
import { db } from '../store.js'
import { createEmbedding } from '../engine/llm.js'
import type { AuthedRequest } from '../middleware/auth.js'
import multer from 'multer'
import fs from 'node:fs'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

async function embedDocumentChunks(tenantId: string, documentId: string) {
  const chunks = await db.listChunksWithoutEmbedding(tenantId, documentId)
  for (const ch of chunks) {
    const vec = await createEmbedding(tenantId, ch.content)
    await db.setChunkEmbedding(ch.id, vec)
  }
}

async function parseFile(file: Express.Multer.File): Promise<string> {
  const ext = file.originalname.toLowerCase().split('.').pop() ?? ''
  if (['pdf'].includes(ext)) {
    const { PDFParse } = await import('pdf-parse')
    const data = await (PDFParse as unknown as (buf: Buffer) => Promise<{ text: string }>)(file.buffer)
    return data.text
  }
  if (['docx'].includes(ext)) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: file.buffer })
    return result.value
  }
  return file.buffer.toString('utf-8')
}

router.get('/bases', async (req: AuthedRequest, res: Response) => {
  const list = await db.listKnowledgeBases(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

router.post('/bases', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { name, description } = (req.body ?? {}) as { name?: string; description?: string }
  const n = String(name ?? '').trim()
  if (!n) {
    res.status(400).json({ success: false, error: '名称必填' })
    return
  }
  const kb = await db.createKnowledgeBase(tenantId, n, description?.trim())
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'knowledge.create',
    resourceType: 'knowledge_base',
    resourceId: kb.id,
  })
  res.status(201).json({ success: true, data: kb })
})

router.delete('/bases/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const ok = await db.deleteKnowledgeBase(tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.get('/bases/:id/documents', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const kb = await db.findKnowledgeBase(tenantId, req.params.id)
  if (!kb) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const docs = await db.listKnowledgeDocuments(tenantId, req.params.id)
  res.json({ success: true, data: docs })
})

router.post('/bases/:id/documents', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const kbaseId = req.params.id
  const kb = await db.findKnowledgeBase(tenantId, kbaseId)
  if (!kb) {
    res.status(404).json({ success: false, error: '知识库不存在' })
    return
  }
  const { title, content } = (req.body ?? {}) as { title?: string; content?: string }
  const t = String(title ?? '').trim()
  const c = String(content ?? '').trim()
  if (!t || !c) {
    res.status(400).json({ success: false, error: '标题与内容必填' })
    return
  }
  const doc = await db.addKnowledgeDocument(tenantId, kbaseId, t, c)
  void embedDocumentChunks(tenantId, doc.id).catch((e) =>
    console.error('[knowledge] embed failed', e),
  )
  res.status(201).json({ success: true, data: doc })
})

router.post('/bases/:id/upload', upload.single('file'), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.auth!.tenantId
    const kbaseId = req.params.id
    const kb = await db.findKnowledgeBase(tenantId, kbaseId)
    if (!kb) {
      res.status(404).json({ success: false, error: '知识库不存在' })
      return
    }
    const file = (req as unknown as { file?: Express.Multer.File }).file
    if (!file) {
      res.status(400).json({ success: false, error: '未上传文件' })
      return
    }
    const title = file.originalname
    const text = await parseFile(file)
    if (!text?.trim()) {
      res.status(400).json({ success: false, error: '文件内容为空或无法解析' })
      return
    }

    const doc = await db.addKnowledgeDocument(tenantId, kbaseId, title, text, 'file')
    void embedDocumentChunks(tenantId, doc.id).catch((e) =>
      console.error('[knowledge] embed failed', e),
    )
    res.status(201).json({ success: true, data: doc })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '文件解析失败' })
  }
})

router.post('/bases/:id/search', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { query, limit, mode } = (req.body ?? {}) as { query?: string; limit?: number; mode?: string }
  const q = String(query ?? '').trim()
  if (!q) {
    res.status(400).json({ success: false, error: '查询词必填' })
    return
  }
  const lim = limit ?? 5

  if (mode === 'vector') {
    const vectorized = await db.countVectorizedChunks(tenantId, req.params.id)
    if (vectorized === 0) {
      res.json({
        success: true,
        data: [],
        mode: 'vector',
        warning:
          '文档尚未向量化。请先在「AI 模型」配置 Embedding 模型，再对文档点「重向量化」。临时可用「关键词」或「混合」检索。',
      })
      return
    }
    try {
      const hits = await db.searchKnowledgeChunksVector(tenantId, req.params.id, q, lim)
      res.json({ success: true, data: hits, mode: 'vector' })
    } catch (e) {
      res.json({
        success: true,
        data: [],
        mode: 'vector',
        warning: e instanceof Error ? e.message : '向量检索失败',
      })
    }
    return
  }

  if (mode === 'hybrid') {
    try {
      const hits = await db.searchKnowledgeChunksHybrid(tenantId, req.params.id, q, lim)
      res.json({ success: true, data: hits, mode: 'hybrid' })
    } catch (e) {
      res.json({
        success: true,
        data: [],
        mode: 'hybrid',
        warning: e instanceof Error ? e.message : '混合检索失败，请尝试关键词检索',
      })
    }
    return
  }

  const hits = await db.searchKnowledgeChunks(tenantId, req.params.id, q, lim)
  res.json({ success: true, data: hits, mode: 'keyword' })
})

router.delete('/documents/:docId', async (req: AuthedRequest, res: Response) => {
  const ok = await db.deleteKnowledgeDocument(req.auth!.tenantId, req.params.docId)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.post('/documents/:docId/reindex', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  void embedDocumentChunks(tenantId, req.params.docId).catch((e) =>
    console.error('[knowledge] reindex failed', e),
  )
  res.json({ success: true, message: '已向量化任务已启动' })
})

export default router
