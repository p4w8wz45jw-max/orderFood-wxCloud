// 云函数：getAllData
// 绕过客户端20条限制，返回集合数据
// 支持可选参数：
//   recentDays: 只返回最近 N 天（基于 createTime）的数据，默认不限
//   onlyPaid: 仅返回已支付订单（兼容 payStatus / pay_status / status），默认不限
//   maxCount: 最多返回条数（截断），默认不截断
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { collection } = event
  try {
    const recentDays = Number(event.recentDays)
    const maxCount = Number(event.maxCount)

    // 构建查询条件
    const conditions = []
    if (recentDays > 0) {
      const start = new Date(Date.now() - recentDays * 24 * 3600 * 1000)
      conditions.push({ createTime: _.gte(start) })
    }
    if (event.onlyPaid) {
      conditions.push(_.or([
        { payStatus: true },
        { pay_status: true },
        { status: 'paid' },
        { status: 1 }
      ]))
    }
    let query = db.collection(collection)
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : _.and(conditions))
    }

    // 云函数环境下limit(1000)有效，客户端limit(100)可能仍只返回20
    const MAX_LIMIT = 1000
    let all = []
    let skip = 0
    let degraded = false
    while (true) {
      if (maxCount > 0 && all.length >= maxCount) break
      const need = maxCount > 0 ? Math.min(MAX_LIMIT, maxCount - all.length) : MAX_LIMIT
      let res
      try {
        res = await query.skip(skip).limit(need).get()
      } catch (e) {
        // 跨字段 OR / 范围组合查询可能因缺少索引而失败，退化为全量读取（旧版行为），由客户端自行过滤兜底
        if (!degraded && conditions.length > 0) {
          degraded = true
          all = []
          skip = 0
          query = db.collection(collection)
          continue
        }
        throw e
      }
      all = all.concat(res.data)
      if (res.data.length < need || res.data.length < MAX_LIMIT) break
      skip += need
    }
    return { success: true, data: all, total: all.length }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
