/**
 * 一键创建AI客服向导 API
 * POST /api/bot-wizard/create
 */
import { Router, type Response } from 'express'
import { pool } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

export interface BotWizardInput {
  industry: 'catering' | 'medical_beauty' | 'hair_salon' | 'fitness' | 'decoration' | 'auto_repair'
  storeName: string
  address: string
  phone: string
  wechat: string
  hoursLunch: string
  hoursDinner: string
  hoursWeekend: string
  avgPrice: string
  menuText: string
  welcomeMessage?: string
  // 渠道配置
  channelWechat?: { corpId: string; secret: string; agentId: string; token: string; encodingAESKey: string }
  channelFeishu?: { appId: string; appSecret: string; token: string; verificationToken: string }
}

const INDUSTRY_PROMPTS: Record<string, { system: string; name: string }> = {
  catering: {
    name: '餐饮智能助手',
    system: `你是「{{vars.store.name}}」的智能前台助手。

【门店信息】
- 店名：{{vars.store.name}}
- 地址：{{vars.store.address}}
- 营业时间：午餐 {{vars.store.hoursLunch}}，晚餐 {{vars.store.hoursDinner}}
- 电话：{{vars.store.phone}}
- 微信：{{vars.store.wechat}}

【人设】
- 你是店里干了3年的前台小妹，性格热情、说话接地气
- 回复要像真人聊天一样自然，带表情符号，像朋友一样
- 不要像机器人那样说"根据知识库""根据资料显示"

【核心能力】
1. 解答菜品相关问题（招牌菜、口味、辣度、分量、过敏原等）
2. 告知营业时间和地址
3. 接受预约订位（问人数、时间、手机号）
4. 告知优惠活动（套餐、会员价、团购等）
5. 处理外卖/自提咨询

【私域引导策略】（重要！）
在合适的时候自然引导客户加微信/企微，话术示例：
- "亲可以加我微信{{vars.store.wechat}}，有新菜和优惠活动第一时间通知您~"
- "您留个微信，我帮您预留位置，到了直接入座"
- "加我微信发您定位，还有88折优惠券哦"

【回复规则】
- 语气亲切，多用"亲""咱家""您"
- 主动推荐招牌菜和套餐
- 遇到知识库没有的信息，诚实说"这个我帮您问问后厨/店长"
- 不要承诺做不到的事（如"保证有位置"）
- 每句话控制在50字以内，不要太长`,
  },
  medical_beauty: {
    name: '医美智能助手',
    system: `你是「{{vars.store.name}}」的资深美学顾问。

【门店信息】
- 机构名：{{vars.store.name}}
- 地址：{{vars.store.address}}
- 营业时间：{{vars.store.hoursWeekend}}
- 电话：{{vars.store.phone}}
- 微信：{{vars.store.wechat}}

【人设】
- 你在医美行业做了5年，专业但不傲慢，温柔有耐心
- 像闺蜜一样帮客户分析问题，不推销、不施压
- 回复要让人感觉被理解和尊重

【核心能力】
1. 解答项目咨询（功效、适合人群、恢复期、价格区间）
2. 初步面部分析建议（但不诊断）
3. 告知门店地址、营业时间、预约方式
4. 解答术后护理问题
5. 处理活动优惠咨询

【合规红线】
- 绝不承诺效果（如"保证瘦10斤""一定变美"）
- 不推荐具体医生（说"我们有几位经验丰富的医生，面诊时为您匹配最适合的"）
- 医疗问题（如"我这个斑是不是病变"）必须引导到院面诊
- 不说"治疗""治愈"，用"改善""调理"

【私域引导策略】（重要！）
在建立信任后自然引导加微信/企微：
- "方便的话加我微信{{vars.store.wechat}}，我发您一些案例参考，也能帮您预约免费面诊"
- "我微信发您一份术后护理指南，加一下方便后续跟进"
- "我们有新客体验活动，加我微信帮您申请专属名额"

【回复规则】
- 先共情再解答（"理解您的顾虑""很多客人刚开始也有这个疑问"）
- 专业术语要解释清楚
- 遇到不确定的问题，诚实说"这个需要医生面诊评估"
- 每句话控制在60字以内`,
  },
}

router.post('/create', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<BotWizardInput>

  const industry = String(body.industry ?? 'catering')
  const storeName = String(body.storeName ?? '').trim()
  const address = String(body.address ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  const wechat = String(body.wechat ?? '').trim()
  const hoursLunch = String(body.hoursLunch ?? '').trim()
  const hoursDinner = String(body.hoursDinner ?? '').trim()
  const hoursWeekend = String(body.hoursWeekend ?? '').trim()
  const avgPrice = String(body.avgPrice ?? '').trim()
  const menuText = String(body.menuText ?? '').trim()
  const welcomeMessage = String(body.welcomeMessage ?? '您好，我是AI客服，有什么可以帮您的？').trim()
  const channelWechat = body.channelWechat
  const channelFeishu = body.channelFeishu

  if (!storeName || !address || !phone) {
    res.status(400).json({ success: false, error: '店名、地址、电话必填' })
    return
  }

  const promptCfg = INDUSTRY_PROMPTS[industry] ?? INDUSTRY_PROMPTS.catering

  try {
    // 1. 保存门店信息
    await pool.query(
      `INSERT INTO store_profiles (tenant_id, industry, name, slogan, address, phone, wechat, hours_lunch, hours_dinner, hours_weekend, avg_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id) DO UPDATE SET
         industry=EXCLUDED.industry, name=EXCLUDED.name, slogan=EXCLUDED.slogan,
         address=EXCLUDED.address, phone=EXCLUDED.phone, wechat=EXCLUDED.wechat,
         hours_lunch=EXCLUDED.hours_lunch, hours_dinner=EXCLUDED.hours_dinner,
         hours_weekend=EXCLUDED.hours_weekend, avg_price=EXCLUDED.avg_price,
         updated_at=now()`,
      [tenantId, industry, storeName, '', address, phone, wechat, hoursLunch, hoursDinner, hoursWeekend, avgPrice],
    )

    // 2. 创建知识库
    const kbRes = await pool.query(
      `INSERT INTO knowledge_bases (tenant_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, `${storeName}知识库`, `${storeName}的菜单/项目及FAQ`],
    )
    const kbaseId = kbRes.rows[0].id

    // 3. 添加知识库文档
    if (menuText) {
      await pool.query(
        `INSERT INTO knowledge_documents (kbase_id, tenant_id, title, source_type, content)
         VALUES ($1, $2, $3, 'text', $4)`,
        [kbaseId, tenantId, '菜单/项目清单', menuText],
      )
    }

    // 4. 创建工作流
    const wfRes = await pool.query(
      `INSERT INTO workflows (tenant_id, name, status, definition, updated_at)
       VALUES ($1, $2, 'published', $3::jsonb, now())
       RETURNING id`,
      [tenantId, promptCfg.name, JSON.stringify({
        nodes: [
          { id: 't1', type: 'trigger.chat', label: '对话', config: {}, position: { x: 80, y: 200 } },
          { id: 'k1', type: 'ai.knowledge', label: '知识检索', config: { topK: 5, query: '{{trigger.content}}', kbaseId }, position: { x: 300, y: 200 } },
          { id: 'a1', type: 'ai.agent', label: 'AI Agent', config: { kbaseId: '', maxSteps: 1, enableHttp: false, userPrompt: '客户问题：{{trigger.content}}\n\n知识库检索结果：\n{{steps.k1.text}}', systemPrompt: promptCfg.system }, position: { x: 550, y: 200 } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'k1' },
          { id: 'e2', source: 'k1', target: 'a1' },
        ],
      })],
    )
    const workflowId = wfRes.rows[0].id

    // 创建版本记录
    await pool.query(
      `INSERT INTO workflow_versions (tenant_id, workflow_id, version, definition, note)
       VALUES ($1, $2, 1, (SELECT definition FROM workflows WHERE id=$2), '初始版本')`,
      [tenantId, workflowId],
    )

    // 5. 创建对话应用
    const appRes = await pool.query(
      `INSERT INTO chat_apps (tenant_id, name, workflow_id, api_key, status, config)
       VALUES ($1, $2, $3, md5(random()::text || clock_timestamp()::text), 'published', $4::jsonb)
       RETURNING id, api_key`,
      [tenantId, `${storeName}AI客服`, workflowId, JSON.stringify({ welcome: welcomeMessage })],
    )

    // 6. 保存渠道配置
    if (channelWechat && channelWechat.corpId && channelWechat.secret) {
      await pool.query(
        `INSERT INTO channel_configs (tenant_id, wecom) VALUES ($1, $2::jsonb)
         ON CONFLICT (tenant_id) DO UPDATE SET wecom=EXCLUDED.wecom`,
        [tenantId, JSON.stringify(channelWechat)],
      )
    }
    if (channelFeishu && channelFeishu.appId && channelFeishu.appSecret) {
      await pool.query(
        `INSERT INTO channel_configs (tenant_id, feishu) VALUES ($1, $2::jsonb)
         ON CONFLICT (tenant_id) DO UPDATE SET feishu=EXCLUDED.feishu`,
        [tenantId, JSON.stringify(channelFeishu)],
      )
    }

    res.status(201).json({
      success: true,
      data: {
        workflowId,
        kbaseId,
        appId: appRes.rows[0].id,
        apiKey: appRes.rows[0].api_key,
        chatUrl: `/chat/${appRes.rows[0].api_key}`,
        channels: {
          wecom: !!channelWechat?.corpId,
          feishu: !!channelFeishu?.appId,
        },
      },
    })
  } catch (err: any) {
    console.error('Bot wizard error:', err)
    res.status(500).json({ success: false, error: err.message ?? '创建失败' })
  }
})

export default router
