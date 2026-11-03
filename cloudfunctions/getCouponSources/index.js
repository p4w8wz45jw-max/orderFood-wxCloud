// 云函数：getCouponSources
// 按 user_coupons 的 _id 批量查询优惠券来源（source 等字段）
// 用于旧订单补全优惠券来源：客户端直查受数据库权限限制（管理员查不到他人优惠券），必须走云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { ids } = event
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: true, data: [] }
  }
  try {
    const result = []
    // 分批查询（每批 50 条，避免 in 查询超限）
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      const res = await db.collection('user_coupons')
        .where({ _id: _.in(batch) })
        .field({ _id: true, source: true, name: true, type: true, productId: true })
        .limit(50)
        .get()
      result.push(...res.data)
    }
    return { success: true, data: result }
  } catch (err) {
    console.error('getCouponSources 查询失败', err)
    return { success: false, error: err.message }
  }
}
