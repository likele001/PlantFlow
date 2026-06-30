import { useEffect, useState, useRef } from 'react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import {
  Bot, UtensilsCrossed, Sparkles, Wrench, Car, Paintbrush, Dumbbell,
  ChevronRight, ChevronLeft, Loader2, Send, MessageCircle, CheckCircle2,
  Copy, ExternalLink, Store, Phone, MapPin, Clock, CreditCard, FileText,
  MessageSquare, Briefcase,
} from 'lucide-react'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const INDUSTRIES = [
  { id: 'catering', name: '餐饮', icon: UtensilsCrossed, color: 'bg-orange-500', desc: '餐厅、奶茶店、小吃店' },
  { id: 'medical_beauty', name: '医美', icon: Sparkles, color: 'bg-pink-500', desc: '美容院、医美诊所' },
  { id: 'hair_salon', name: '美发', icon: Paintbrush, color: 'bg-purple-500', desc: '理发店、美甲店' },
  { id: 'fitness', name: '健身', icon: Dumbbell, color: 'bg-blue-500', desc: '健身房、瑜伽馆' },
  { id: 'decoration', name: '装修', icon: Wrench, color: 'bg-yellow-500', desc: '装修公司、设计工作室' },
  { id: 'auto_repair', name: '汽修', icon: Car, color: 'bg-red-500', desc: '汽修店、保养中心' },
]

const CHANNELS = [
  { id: 'wecom', name: '企业微信', icon: Briefcase, color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/20', desc: '客户通过企微好友/群发消息，AI自动回复' },
  { id: 'feishu', name: '飞书', icon: MessageSquare, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/20', desc: '客户通过飞书群发消息，AI自动回复' },
]

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function BotAssistant() {
  const { token } = useAuthStore()
  const [step, setStep] = useState<Step>(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ workflowId: string; appId: string; apiKey: string; chatUrl: string; channels: { wecom: boolean; feishu: boolean } } | null>(null)

  // 表单数据
  const [industry, setIndustry] = useState('catering')
  const [storeName, setStoreName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [wechat, setWechat] = useState('')
  const [hoursLunch, setHoursLunch] = useState('11:00-14:00')
  const [hoursDinner, setHoursDinner] = useState('17:00-21:30')
  const [hoursWeekend, setHoursWeekend] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [menuText, setMenuText] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('您好，有什么可以帮您的？')

  // 渠道配置
  const [enabledChannels, setEnabledChannels] = useState<string[]>([])
  const [wecom, setWecom] = useState({ corpId: '', secret: '', agentId: '', token: '', encodingAESKey: '' })
  const [feishu, setFeishu] = useState({ appId: '', appSecret: '', token: '', verificationToken: '' })

  // 测试对话
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatting, setChatting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function toggleChannel(id: string) {
    setEnabledChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function createBot() {
    if (!token) return
    setCreating(true)
    setError('')
    try {
      const body: Record<string, any> = {
        industry, storeName, address, phone, wechat,
        hoursLunch, hoursDinner, hoursWeekend, avgPrice,
        menuText, welcomeMessage,
      }
      if (enabledChannels.includes('wecom') && wecom.corpId && wecom.secret) {
        body.channelWechat = wecom
      }
      if (enabledChannels.includes('feishu') && feishu.appId && feishu.appSecret) {
        body.channelFeishu = feishu
      }
      const res = await apiRequest<{ success: boolean; data: any; error?: string }>('/api/bot-wizard/create', {
        token,
        method: 'POST',
        body,
      })
      if (res.success && res.data) {
        setResult(res.data)
        setStep(6)
      } else {
        setError(res.error || '创建失败')
      }
    } catch (e: any) {
      setError(e.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function sendTestMessage() {
    if (!input.trim() || !result || chatting) return
    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setInput('')
    setChatting(true)
    try {
      const res = await apiRequest<{ data?: { text?: string } }>(`/api/v1/chat/message`, {
        token,
        method: 'POST',
        body: { api_key: result.apiKey, message: userMsg },
      })
      const text = res.data?.text || '抱歉，我暂时无法回答'
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，服务暂时不可用' }])
    } finally {
      setChatting(false)
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
  }

  const steps = [
    { num: 1, label: '选择行业' },
    { num: 2, label: '门店信息' },
    { num: 3, label: '上传菜单' },
    { num: 4, label: '接入渠道' },
    { num: 5, label: '创建' },
    { num: 6, label: '完成' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 步骤导航 */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-1">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
              step >= s.num ? 'bg-indigo-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800'
            }`}>
              {step > s.num ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
            </div>
            <span className={`text-xs ${step >= s.num ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3 w-3 text-zinc-300 dark:text-zinc-700" />
            )}
          </div>
        ))}
      </div>

      {/* 步骤1：选择行业 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">选择你的行业</h2>
            <p className="text-sm text-zinc-500">我们会根据行业自动配置AI客服的话术</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {INDUSTRIES.map(ind => {
              const Icon = ind.icon
              const active = industry === ind.id
              return (
                <button key={ind.id} onClick={() => setIndustry(ind.id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition ${
                    active ? 'border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/40'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40'
                  }`}>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${ind.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{ind.name}</div>
                    <div className="text-xs text-zinc-400">{ind.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-600">
              下一步 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 步骤2：填写门店信息 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">填写门店信息</h2>
            <p className="text-sm text-zinc-500">这些信息会用于AI客服自动回答客户问题</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <Store className="h-3.5 w-3.5" /> 店名 <span className="text-red-400">*</span>
                </label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="味湘阁" value={storeName} onChange={e => setStoreName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <Phone className="h-3.5 w-3.5" /> 电话 <span className="text-red-400">*</span>
                </label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="138-xxxx-xxxx" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <MapPin className="h-3.5 w-3.5" /> 地址 <span className="text-red-400">*</span>
                </label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="重庆市渝北区金开大道123号" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">微信号（引导客户加）</label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="微信号" value={wechat} onChange={e => setWechat(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <CreditCard className="h-3.5 w-3.5" /> 人均消费
                </label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="人均60-80元" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5" /> 午餐时间
                </label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" value={hoursLunch} onChange={e => setHoursLunch(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5" /> 晚餐时间
                </label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" value={hoursDinner} onChange={e => setHoursDinner(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">周末/节假日营业时间</label>
                <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="周末 10:00-22:00" value={hoursWeekend} onChange={e => setHoursWeekend(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="flex items-center gap-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400">
              <ChevronLeft className="h-4 w-4" /> 上一步
            </button>
            <button onClick={() => setStep(3)} disabled={!storeName || !address || !phone}
              className="flex items-center gap-1 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
              下一步 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 步骤3：上传菜单/项目 */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {industry === 'catering' ? '上传菜单' : '上传项目/FAQ'}
            </h2>
            <p className="text-sm text-zinc-500">AI会根据这些内容回答客户问题（可以跳过，稍后再传）</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <textarea
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              rows={10}
              placeholder={`招牌菜：\n- 剁椒鱼头 88元（中辣）\n- 小炒黄牛肉 58元\n- 农家一碗香 32元\n\n优惠活动：\n- 新客关注送酸梅汤\n- 周一至周四午餐8.8折`}
              value={menuText} onChange={e => setMenuText(e.target.value)}
            />
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="flex items-center gap-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400">
              <ChevronLeft className="h-4 w-4" /> 上一步
            </button>
            <button onClick={() => setStep(4)} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-600">
              下一步 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 步骤4：接入渠道 */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">接入渠道</h2>
            <p className="text-sm text-zinc-500">选择客户通过哪里和你对话（可以跳过，稍后再配）</p>
          </div>
          <div className="space-y-3">
            {/* 企业微信 */}
            <div className={`rounded-xl border p-4 transition ${enabledChannels.includes('wecom') ? 'border-green-300 bg-green-50/50 dark:border-green-800' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Briefcase className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">企业微信</div>
                    <div className="text-xs text-zinc-400">客户通过企微好友/群发消息，AI自动回复</div>
                  </div>
                </div>
                <button onClick={() => toggleChannel('wecom')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    enabledChannels.includes('wecom') ? 'bg-green-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800'
                  }`}>
                  {enabledChannels.includes('wecom') ? '已启用' : '启用'}
                </button>
              </div>
              {enabledChannels.includes('wecom') && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">CorpID</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="ww1234abcd" value={wecom.corpId} onChange={e => setWecom({ ...wecom, corpId: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">Secret</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="应用Secret" value={wecom.secret} onChange={e => setWecom({ ...wecom, secret: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">AgentId</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="1000002" value={wecom.agentId} onChange={e => setWecom({ ...wecom, agentId: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">Token</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="回调Token" value={wecom.token} onChange={e => setWecom({ ...wecom, token: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 text-xs font-medium text-zinc-500">EncodingAESKey</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="消息加解密密钥" value={wecom.encodingAESKey} onChange={e => setWecom({ ...wecom, encodingAESKey: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* 飞书 */}
            <div className={`rounded-xl border p-4 transition ${enabledChannels.includes('feishu') ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">飞书</div>
                    <div className="text-xs text-zinc-400">客户通过飞书群发消息，AI自动回复</div>
                  </div>
                </div>
                <button onClick={() => toggleChannel('feishu')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    enabledChannels.includes('feishu') ? 'bg-blue-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800'
                  }`}>
                  {enabledChannels.includes('feishu') ? '已启用' : '启用'}
                </button>
              </div>
              {enabledChannels.includes('feishu') && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">App ID</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="cli_xxx" value={feishu.appId} onChange={e => setFeishu({ ...feishu, appId: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">App Secret</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="应用Secret" value={feishu.appSecret} onChange={e => setFeishu({ ...feishu, appSecret: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">Verification Token</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="验证Token" value={feishu.verificationToken} onChange={e => setFeishu({ ...feishu, verificationToken: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 text-xs font-medium text-zinc-500">Encrypt Key</label>
                    <input className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800" placeholder="加密Key" value={feishu.token} onChange={e => setFeishu({ ...feishu, token: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="flex items-center gap-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400">
              <ChevronLeft className="h-4 w-4" /> 上一步
            </button>
            <button onClick={() => { setStep(5); createBot() }} disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {creating ? '创建中...' : '创建AI客服'}
            </button>
          </div>
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
        </div>
      )}

      {/* 步骤5：创建中 */}
      {step === 5 && creating && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="mt-4 text-sm text-zinc-500">正在创建AI客服...</p>
          <p className="text-xs text-zinc-400">保存门店信息 → 创建知识库 → 配置工作流 → 生成对话应用 → 配置渠道</p>
        </div>
      )}

      {/* 步骤6：完成 + 测试 */}
      {step === 6 && result && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">AI客服创建成功！</h2>
            <p className="text-sm text-zinc-500">
              {result.channels.wecom && '企业微信'}{result.channels.wecom && result.channels.feishu && ' + '}{result.channels.feishu && '飞书'}
              {result.channels.wecom || result.channels.feishu ? '已接入' : '直接在下方测试对话'}
            </p>
          </div>

          {/* API Key */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-zinc-500">API Key（可用于第三方对接）</div>
                <div className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">{result.apiKey}</div>
              </div>
              <button onClick={() => copyKey(result.apiKey)} className="rounded-lg border border-zinc-300 p-2 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 测试聊天窗口 */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-500" />
                <span className="font-medium text-sm text-zinc-800 dark:text-zinc-200">测试对话</span>
              </div>
            </div>
            <div className="h-80 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-zinc-400">
                  <MessageCircle className="mb-2 h-8 w-8" />
                  <p className="text-sm">输入消息测试AI客服</p>
                  <p className="text-xs">例如："你们店在哪？"、"有什么招牌菜？"</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatting && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  placeholder="输入测试消息..." value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendTestMessage()} />
                <button onClick={sendTestMessage} disabled={!input.trim() || chatting}
                  className="flex items-center justify-center rounded-lg bg-indigo-500 px-4 text-white hover:bg-indigo-600 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 已接入渠道状态 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h3 className="mb-3 font-semibold text-zinc-800 dark:text-zinc-200">接入状态</h3>
            <div className="space-y-2 text-sm">
              {result.channels.wecom && (
                <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <div className="font-medium">企业微信</div>
                    <div className="text-xs text-zinc-400">已配置，客户可通过企微与AI对话</div>
                  </div>
                </div>
              )}
              {result.channels.feishu && (
                <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <div className="font-medium">飞书</div>
                    <div className="text-xs text-zinc-400">已配置，客户可通过飞书与AI对话</div>
                  </div>
                </div>
              )}
              {!result.channels.wecom && !result.channels.feishu && (
                <div className="rounded-lg bg-zinc-50 p-3 text-center text-xs text-zinc-400 dark:bg-zinc-800/50">
                  未接入渠道，客户暂时只能通过API调用。可在「渠道接入」页面配置。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
