// cloudfunctions/adminStatistics/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { startDate, endDate } = event

  if (!startDate || !endDate) {
    return { success: false, error: '请提供起止日期' }
  }

  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T23:59:59')

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: '日期格式无效' }
  }

  try {
    // 查询时间范围内的所有点餐订单（分页拉取）
    const allOrders = await fetchAllOrders(start, end, db, _)

    let totalRevenue = 0      // 总收入（已支付且未退款）
    let totalRefund = 0       // 总退款金额
    let orderCount = 0        // 有效订单数
    let refundCount = 0       // 退款订单数
    const productSales = {}   // key: dishName, value: { count, amount }

    allOrders.forEach(order => {
      // 判断是否为已退款订单
      const isRefunded = order.status === 'refunded' || order.status === 'cancelled'
        || order.status === 4 || order.status === 3
        || order.status === 'refunding'
        || !!order.refundTime

      const paid = (order.balancePaid || 0) + (order.wechatPaid || 0)
      const goodsList = order.goodsList || []

      if (isRefunded) {
        // 退款订单
        totalRefund += paid
        refundCount++
      } else if (order.payStatus) {
        // 已支付且未退款 = 有效收入
        totalRevenue += paid
        orderCount++

        // 统计商品销量
        goodsList.forEach(item => {
          const name = item.dishName || item.name || '未知商品'
          if (!productSales[name]) {
            productSales[name] = { count: 0, amount: 0 }
          }
          productSales[name].count += item.count || 1
          productSales[name].amount += (item.price || 0) * (item.count || 1)
        })
      }
    })

    // 按销量降序排列
    const productList = Object.entries(productSales).map(([name, data]) => ({
      name,
      count: data.count,
      amount: parseFloat(data.amount.toFixed(2))
    })).sort((a, b) => b.count - a.count)

    return {
      success: true,
      data: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalRefund: parseFloat(totalRefund.toFixed(2)),
        orderCount,
        refundCount,
        productList
      }
    }
  } catch (err) {
    console.error('统计数据失败', err)
    return { success: false, error: err.message }
  }
}

// 分页拉取所有订单
async function fetchAllOrders(start, end, db, _) {
  const allOrders = []
  const pageSize = 100
  let offset = 0

  while (true) {
    const res = await db.collection('order')
      .where({
        type: 'order',
        createTime: _.gte(start).and(_.lte(end))
      })
      .skip(offset)
      .limit(pageSize)
      .orderBy('createTime', 'asc')
      .get()

    if (!res.data || res.data.length === 0) break

    allOrders.push(...res.data)
    offset += res.data.length

    if (res.data.length < pageSize) break
  }

  return allOrders
}
