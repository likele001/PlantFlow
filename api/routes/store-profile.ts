/**
 * 门店信息配置路由
 * GET/POST /api/store-profile
 */
import { Router, type Response } from 'express'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

export interface StoreProfile {
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

router.get('/store-profile', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const { rows } = await pool.query<StoreProfile & { tenantId: string }>(
    `SELECT tenant_id AS "tenantId", industry, name, slogan, address, landmark, parking,
            phone, wechat, hours_lunch AS "hoursLunch", hours_dinner AS "hoursDinner",
            hours_weekend AS "hoursWeekend", holiday_note AS "holidayNote",
            avg_price AS "avgPrice", current_promotions AS "currentPromotions",
            features
     FROM store_profiles WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) {
    res.status(200).json({ success: true, data: null })
    return
  }
  res.status(200).json({ success: true, data: rows[0] })
})

router.post('/store-profile', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<StoreProfile>

  const profile: StoreProfile = {
    industry: String(body.industry ?? 'catering').trim(),
    name: String(body.name ?? '').trim(),
    slogan: String(body.slogan ?? '').trim(),
    address: String(body.address ?? '').trim(),
    landmark: String(body.landmark ?? '').trim(),
    parking: String(body.parking ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
    wechat: String(body.wechat ?? '').trim(),
    hoursLunch: String(body.hoursLunch ?? '').trim(),
    hoursDinner: String(body.hoursDinner ?? '').trim(),
    hoursWeekend: String(body.hoursWeekend ?? '').trim(),
    holidayNote: String(body.holidayNote ?? '').trim(),
    avgPrice: String(body.avgPrice ?? '').trim(),
    currentPromotions: Array.isArray(body.currentPromotions) ? body.currentPromotions : [],
    features: Array.isArray(body.features) ? body.features : [],
  }

  await pool.query(
    `INSERT INTO store_profiles (tenant_id, industry, name, slogan, address, landmark, parking,
       phone, wechat, hours_lunch, hours_dinner, hours_weekend, holiday_note,
       avg_price, current_promotions, features)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (tenant_id) DO UPDATE SET
       industry = EXCLUDED.industry,
       name = EXCLUDED.name,
       slogan = EXCLUDED.slogan,
       address = EXCLUDED.address,
       landmark = EXCLUDED.landmark,
       parking = EXCLUDED.parking,
       phone = EXCLUDED.phone,
       wechat = EXCLUDED.wechat,
       hours_lunch = EXCLUDED.hours_lunch,
       hours_dinner = EXCLUDED.hours_dinner,
       hours_weekend = EXCLUDED.hours_weekend,
       holiday_note = EXCLUDED.holiday_note,
       avg_price = EXCLUDED.avg_price,
       current_promotions = EXCLUDED.current_promotions,
       features = EXCLUDED.features,
       updated_at = now()`,
    [tenantId, profile.industry, profile.name, profile.slogan, profile.address,
     profile.landmark, profile.parking, profile.phone, profile.wechat,
     profile.hoursLunch, profile.hoursDinner, profile.hoursWeekend,
     profile.holidayNote, profile.avgPrice,
     JSON.stringify(profile.currentPromotions), JSON.stringify(profile.features)],
  )

  res.status(200).json({ success: true, data: profile })
})

export default router
