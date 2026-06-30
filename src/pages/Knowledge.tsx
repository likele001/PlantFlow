import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { BookOpen, FileUp, Plus, Search, Trash2, Upload } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Kbase = {
  id: string
  name: string
  description?: string | null
  documentCount?: number
  chunkCount?: number
  vectorizedChunkCount?: number
}

type Document = {
  id: string
  title: string
  content: string
  createdAt: string
}

type SearchHit = {
  id: string
  title: string
  content: string
  score: number
}

export default function Knowledge() {
  const { token } = useAuthStore()
  const [bases, setBases] = useState<Kbase[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Document[]>([])
  const [newName, setNewName] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchMode, setSearchMode] = useState<'keyword' | 'vector' | 'hybrid'>('hybrid')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const TEXT_EXT = ['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm', '.log', '.xml']
  const BINARY_EXT = ['.pdf', '.docx']
  const ACCEPT_EXT = [...TEXT_EXT, ...BINARY_EXT]
  const MAX_FILE_BYTES = 5 * 1024 * 1024

  const reloadDocs = useCallback(async () => {
    if (!token || !activeId) {
      setDocs([])
      return
    }
    const res = await apiRequest<Document[]>(`/api/knowledge/bases/${activeId}/documents`, { token })
    if ('data' in res) setDocs(res.data)
  }, [token, activeId])

  async function loadBases() {
    if (!token) return
    const res = await apiRequest<Kbase[]>('/api/knowledge/bases', { token })
    if ('data' in res) {
      setBases(res.data)
      if (!activeId && res.data[0]) setActiveId(res.data[0].id)
    }
  }

  useEffect(() => {
    void loadBases()
  }, [token])

  useEffect(() => {
    void reloadDocs()
  }, [reloadDocs])

  async function createBase() {
    if (!token || !newName.trim()) return
    const res = await apiRequest<Kbase>('/api/knowledge/bases', {
      method: 'POST',
      token,
      body: { name: newName.trim() },
    })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setNewName('')
    await loadBases()
    setActiveId(res.data.id)
  }

  async function importDocument(title: string, content: string) {
    if (!token || !activeId) return false
    const res = await apiRequest<Document>(`/api/knowledge/bases/${activeId}/documents`, {
      method: 'POST',
      token,
      body: { title: title.trim(), content: content.trim() },
    })
    if (!('data' in res)) {
      setErr('error' in res ? (res as { error: string }).error : '导入失败')
      return false
    }
    return true
  }

  async function addDoc() {
    if (!token || !activeId) return
    if (!docTitle.trim() || !docContent.trim()) {
      setErr('请填写文档标题和内容')
      return
    }
    setErr(null)
    setStatus(null)
    const ok = await importDocument(docTitle, docContent)
    if (!ok) return
    setDocTitle('')
    setDocContent('')
    await reloadDocs()
    await loadBases()
    setStatus('文档已导入并完成分段')
  }

  function fileTitle(name: string) {
    return name.replace(/\.[^.]+$/, '') || name
  }

  function isAcceptedFile(file: File) {
    const lower = file.name.toLowerCase()
    return ACCEPT_EXT.some((ext) => lower.endsWith(ext))
  }

  function isBinaryFile(file: File) {
    const lower = file.name.toLowerCase()
    return BINARY_EXT.some((ext) => lower.endsWith(ext))
  }

  async function uploadBinaryFile(file: File): Promise<string> {
    if (!token || !activeId) throw new Error('未选择知识库')
    const form = new FormData()
    form.append('file', file)
    const endpoint = `/api/knowledge/bases/${activeId}/upload`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const data = (await res.json().catch(() => null)) as { success?: boolean; data?: { title?: string; content: string } } | null
    if (!res.ok || !data?.success) {
      const msg = (data as { error?: string } | null)?.error ?? res.statusText
      throw new Error(msg)
    }
    return String(data.data?.content ?? '')
  }

  async function readFileText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error(`无法读取文件：${file.name}`))
      reader.readAsText(file, 'utf-8')
    })
  }

  async function importFiles(files: FileList | File[]) {
    if (!token || !activeId) {
      setErr('请先选择知识库')
      return
    }
    const list = Array.from(files)
    if (!list.length) return

    setErr(null)
    setStatus(null)
    setImporting(true)
    let ok = 0
    const skipped: string[] = []

    for (const file of list) {
      if (!isAcceptedFile(file)) {
        skipped.push(`${file.name}（格式不支持）`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(`${file.name}（超过 5MB）`)
        continue
      }
      try {
        let text: string
        if (isBinaryFile(file)) {
          const doc = await uploadBinaryFile(file)
          text = doc
          if (!text.trim()) {
            skipped.push(`${file.name}（内容为空）`)
            continue
          }
          ok += 1
        } else {
          text = (await readFileText(file)).trim()
          if (!text) {
            skipped.push(`${file.name}（内容为空）`)
            continue
          }
          const success = await importDocument(fileTitle(file.name), text)
          if (success) ok += 1
        }
      } catch (e) {
        skipped.push(`${file.name}（${e instanceof Error ? e.message : '读取失败'}）`)
      }
    }

    setImporting(false)
    await reloadDocs()
    await loadBases()

    if (ok > 0) {
      setStatus(`成功导入 ${ok} 个文件，系统正在后台向量化`)
    }
    if (skipped.length) {
      setErr(skipped.join('；'))
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files?.length) void importFiles(files)
    e.target.value = ''
  }

  async function removeBase(id: string) {
    if (!token || !confirm('确定删除该知识库？')) return
    await apiRequest(`/api/knowledge/bases/${id}`, { method: 'DELETE', token })
    await loadBases()
    setActiveId(null)
  }

  async function doSearch() {
    if (!token || !activeId || !searchQ.trim()) return
    setErr(null)
    const res = await apiRequest<SearchHit[]>(`/api/knowledge/bases/${activeId}/search`, {
      method: 'POST',
      token,
      body: { query: searchQ.trim(), limit: 8, mode: searchMode },
    })
    if ('data' in res) {
      setHits(res.data)
      const warning = (res as { warning?: string }).warning
      if (warning) setErr(warning)
    }
  }

  const active = bases.find((b) => b.id === activeId)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">AI · 知识库</div>
        <div className="mt-2 text-2xl font-semibold">文档与检索</div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">{err}</div>
      ) : null}
      {status ? (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{status}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold">知识库</div>
          <div className="mt-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新知识库名称"
              className="h-9 flex-1 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
            <button type="button" onClick={() => void createBase()} className="rounded-xl bg-zinc-900 px-3 text-white dark:bg-zinc-100 dark:text-zinc-950">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-1">
            {bases.map((b) => (
              <div
                key={b.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2',
                  activeId === b.id ? 'bg-zinc-100 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50',
                )}
              >
                <button type="button" onClick={() => setActiveId(b.id)} className="min-w-0 flex-1 text-left text-sm font-semibold">
                  {b.name}
                  <div className="text-xs font-normal text-zinc-500">
                    {b.documentCount ?? 0} 文档 · {b.chunkCount ?? 0} 分段
                    {b.chunkCount ? ` · ${b.vectorizedChunkCount ?? 0} 已向量化` : ''}
                  </div>
                </button>
                <button type="button" onClick={() => void removeBase(b.id)} className="text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {active ? (
            <>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="h-4 w-4" />
                  {active.name} — 导入文档
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  支持上传 .txt / .md / .csv / .json / .html 等文本文件，或下方粘贴内容。导入后自动分段并向量化。
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT_EXT.join(',')}
                  className="hidden"
                  onChange={onFileInputChange}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                    dragOver
                      ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/50',
                  )}
                >
                  <Upload className="mb-2 h-8 w-8 text-zinc-400" />
                  <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    {importing ? '正在导入…' : '点击或拖拽文件到此处'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">单文件最大 5MB，可多选</div>
                </div>

                <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">或手动粘贴</div>
                <div className="mt-2 space-y-2">
                  <input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="文档标题"
                    className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  />
                  <textarea
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="粘贴 Markdown / 纯文本内容"
                    rows={6}
                    className="w-full rounded-xl border px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={() => void addDoc()}
                    disabled={importing}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950"
                  >
                    <FileUp className="h-4 w-4" />
                    粘贴导入并分段
                  </button>
                </div>
              </div>

              {(active.chunkCount ?? 0) > 0 && (active.vectorizedChunkCount ?? 0) === 0 ? (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                  向量检索尚未就绪：文档已分段但未向量化。请到 <strong>AI 模型</strong> 为默认提供商填写 Embedding 模型（Ollama 可用 <code className="text-xs">nomic-embed-text</code>），保存后对文档点「重向量化」。在此之前请用「关键词」检索。
                </div>
              ) : null}

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                 <div className="text-sm font-semibold">检索评测</div>
                <div className="mt-1 text-xs text-zinc-500">
                  <strong>混合</strong>：向量+关键词融合排序（推荐）；<strong>向量</strong>：按语义相似度；<strong>关键词</strong>：按字面匹配。
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="输入问题测试召回"
                    className="h-10 flex-1 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  />
                  <select
                    value={searchMode}
                    onChange={(e) => setSearchMode(e.target.value as 'keyword' | 'vector' | 'hybrid')}
                    className="h-10 rounded-xl border px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <option value="hybrid">混合</option>
                    <option value="vector">向量</option>
                    <option value="keyword">关键词</option>
                  </select>
                  <button type="button" onClick={() => void doSearch()} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold">
                    <Search className="h-4 w-4" />
                    检索
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {hits.map((h) => (
                    <div key={h.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                      <div className="font-semibold">{h.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">相关度 {h.score.toFixed(3)}</div>
                      <div className="mt-2 text-zinc-600 dark:text-zinc-300">{h.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-sm font-semibold">文档列表 ({docs.length})</div>
                <div className="mt-3 space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{d.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{d.content}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => void apiRequest(`/api/knowledge/documents/${d.id}/reindex`, { method: 'POST', token: token! })}
                          className="rounded-lg border px-2 py-1 text-xs"
                        >
                          重向量化
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void apiRequest(`/api/knowledge/documents/${d.id}`, { method: 'DELETE', token: token! }).then(async () => {
                              await reloadDocs()
                              await loadBases()
                            })
                          }
                          className="text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed px-4 py-20 text-center text-sm text-zinc-500">
              创建或选择一个知识库
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
