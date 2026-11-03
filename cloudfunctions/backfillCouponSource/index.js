// 云函数：backfillCouponSource
// 一次性补全历史订单缺失的优惠券来源（couponSource）
// 支持多种历史字段名，并返回详细诊断信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COUPON_ID_FIELDS = ['usedCouponId', 'couponId', 'coupon_id', 'usedCoupon', 'coupon']

function getCouponId(order) {
  for (const field of COUPON_ID_FIELDS) {
    const val = order[field]
    if (val) {
      if (typeof val === 'string') return { field, id: val }
      if (typeof val === 'object' && val._id && typeof val._id === 'string') {
        return { field, id: val._id, isObject: true }
      }
    }
  }
  return null
}

exports.main = async () => {
  try {
    // 1. 分页读取全部订单
    const MAX_LIMIT = 1000
    let orders = []
    let skip = 0
    while (true) {
      const res = await db.collection('order').skip(skip).limit(MAX_LIMIT).get()
      orders = orders.concat(res.data)
      if (res.data.length < MAX_LIMIT) break
      skip += MAX_LIMIT
    }

    // 2. 收集需要补全来源的订单
    const needOrders = orders.filter(o =>
      o.couponName && !o.couponSource && getCouponId(o)
    )

    const directIds = [...new Set(
      needOrders.map(o => {
        const info = getCouponId(o)
        return info && info.field === 'usedCouponId' ? info.id : null
      }).filter(Boolean)
    )]

    const allNeedIds = [...new Set(needOrders.map(o => getCouponId(o).id).filter(Boolean))]

    // 3. 先按 usedCouponId 反查 user_coupons._id
    const sourceMap = {}
    for (let i = 0; i < directIds.length; i += 50) {
      const batch = directIds.slice(i, i + 50)
      const res = await db.collection('user_coupons')
        .where({ _id: _.in(batch) })
        .field({ _id: true, source: true })
        .limit(50)
        .get()
      res.data.forEach(c => { if (c.source) sourceMap[c._id] = c.source })
    }

    // 4. 再尝试用这些 ID 查 coupon 模板集合（旧代码可能把模板 _id 当作用户券 ID 存了）
    const templateIdSet = new Set()
    for (let i = 0; i < allNeedIds.length; i += 50) {
      const batch = allNeedIds.slice(i, i + 50)
      const res = await db.collection('coupon')
        .where({ _id: _.in(batch) })
        .field({ _id: true, name: true })
        .limit(50)
        .get()
      res.data.forEach(c => { if (c._id) templateIdSet.add(c._id) })
    }

    // 5. 若 ID 命中模板，则按 openid + 模板 ID 去 user_coupons 找对应用户券
    const userTemplateSourceMap = {}
    if (templateIdSet.size > 0) {
      const templateIds = [...templateIdSet]
      for (let i = 0; i < templateIds.length; i += 50) {
        const batch = templateIds.slice(i, i + 50)
        let tSkip = 0
        while (true) {
          const res = await db.collection('user_coupons')
            .where({ couponId: _.in(batch) })
            .field({ _openid: true, couponId: true, source: true })
            .skip(tSkip)
            .limit(1000)
            .get()
          res.data.forEach(c => {
            if (c.source && c.couponId && c._openid) {
              const key = `${c._openid}_${c.couponId}`
              if (!userTemplateSourceMap[key]) userTemplateSourceMap[key] = c.source
            }
          })
          if (res.data.length < 1000) break
          tSkip += 1000
        }
      }
    }

    // 6. 兜底：按 openid + couponName 在 user_coupons 中找（券记录可能被重建或 ID 变化）
    const nameSourceMap = {}
    const needNames = [...new Set(needOrders.map(o => o.couponName).filter(Boolean))]
    for (let i = 0; i < needNames.length; i += 10) {
      const batch = needNames.slice(i, i + 10)
      let nSkip = 0
      while (true) {
        const res = await db.collection('user_coupons')
          .where({ name: _.in(batch) })
          .field({ _openid: true, name: true, source: true })
          .skip(nSkip)
          .limit(1000)
          .get()
        res.data.forEach(c => {
          if (c.source && c.name && c._openid) {
            const key = `${c._openid}_${c.name}`
            if (!nameSourceMap[key]) nameSourceMap[key] = c.source
          }
        })
        if (res.data.length < 1000) break
        nSkip += 1000
      }
    }

    // 7. 写回订单
    let updated = 0
    let noSourceCount = 0
    const failedSamples = []
    for (const o of needOrders) {
      const info = getCouponId(o)
      const id = info ? info.id : null
      const source = sourceMap[id] ||
        (templateIdSet.has(id) ? userTemplateSourceMap[`${o._openid}_${id}`] : null) ||
        nameSourceMap[`${o._openid}_${o.couponName}`]
      if (source && source !== o.couponSource) {
        await db.collection('order').doc(o._id).update({ data: { couponSource: source } })
        updated++
      } else if (!source) {
        noSourceCount++
        if (failedSamples.length < 3) {
          failedSamples.push({
            orderId: o._id,
            couponName: o.couponName,
            field: info ? info.field : null,
            idValue: id,
            idType: info ? (info.isObject ? 'object._id' : typeof id) : null,
            isTemplateId: templateIdSet.has(id)
          })
        }
      }
    }

    // 8. 诊断统计
    const fieldStats = {}
    COUPON_ID_FIELDS.forEach(field => {
      fieldStats[field] = orders.filter(o => o.couponName && !o.couponSource && o[field]).length
    })

    const result = {
      success: true,
      totalOrders: orders.length,
      needOrders: needOrders.length,
      updated,
      noSourceCount,
      ordersWithoutCouponId: orders.filter(o => o.couponName && !o.couponSource && !getCouponId(o)).length,
      directIdsQueried: directIds.length,
      directIdsFound: Object.keys(sourceMap).length,
      templateIdsMatched: Object.keys(userTemplateSourceMap).length,
      templateIdsQueried: templateIdSet.size,
      nameMatched: Object.keys(nameSourceMap).length,
      fieldStats,
      failedSamples
    }

    console.log('backfillCouponSource 完成', JSON.stringify(result))
    return result
  } catch (err) {
    console.error('补全优惠券来源失败', err)
    return { success: false, error: err.message }
  }
}
