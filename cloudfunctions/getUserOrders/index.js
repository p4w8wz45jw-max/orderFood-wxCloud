// 云函数：getUserOrders
// 后台会员管理用：按 openid 查询某用户的全部订单（含历史订单与充值），统计总消费
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { openid } = event
  if (!openid) {
    return { success: false, error: '缺少 openid' }
  }
  try {
    // 分页读取该用户全部订单
    const MAX_LIMIT = 1000
    let orders = []
    let skip = 0
    while (true) {
      const res = await db.collection('order')
        .where({ _openid: openid })
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()
      orders = orders.concat(res.data)
      if (res.data.length < MAX_LIMIT) break
      skip += MAX_LIMIT
    }

    const formatTime = (t) => {
      if (!t) return ''
      const d = new Date(t)
      const pad = (n) => (n < 10 ? '0' + n : n)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2)

    const isRecharge = (o) => o.type === 'recharge'
    const isPaid = (o) => !!(o.payStatus || o.pay_status || o.status === 'paid')

    let totalSpent = 0      // 已支付点餐订单实付合计
    let totalRecharge = 0   // 充值总额
    let paidCount = 0       // 已支付订单数（含充值）

    const list = orders.map(o => {
      if (isPaid(o)) paidCount++
      if (isRecharge(o)) {
        totalRecharge += (o.totalGet || o.amount || 0)
      } else if (isPaid(o)) {
        totalSpent += (o.finalPrice || 0)
      }

      let orderTypeText = ''
      if (isRecharge(o)) orderTypeText = '充值'
      else if (o.orderType === 'takeout') orderTypeText = '外卖'
      else if (o.orderType === 'dineIn') orderTypeText = '堂食'
      else orderTypeText = '点餐'

      let statusText = '待支付'
      if (isPaid(o)) statusText = '已支付'
      if (o.status === 'completed' || o.status === 2) statusText = '已完成'
      if (o.status === 'cancelled' || o.status === 3) statusText = '已取消'
      if (o.status === 'refunded' || o.status === 4) statusText = '已退款'
      if (o.status === 'refunding') statusText = '退款中'

      // 商品摘要
      let goodsText = ''
      if (isRecharge(o)) {
        goodsText = `充值 ¥${fmt(o.amount)}${o.giveAmount ? `（赠 ¥${fmt(o.giveAmount)}）` : ''}`
      } else if (o.goodsList && o.goodsList.length) {
        goodsText = o.goodsList.map(g => g.dishName).join('、')
      }

      return {
        _id: o._id,
        orderTypeText,
        statusText,
        paid: isPaid(o),
        finalPrice: o.finalPrice || 0,
        finalPriceText: fmt(o.finalPrice),
        wechatPaid: o.wechatPaid || 0,
        balancePaid: o.balancePaid || 0,
        goodsText,
        createTimeText: formatTime(o.createTime)
      }
    })

    // 按时间倒序
    list.sort((a, b) => {
      const t1 = a.createTimeText ? new Date(a.createTimeText.replace(/-/g, '/')).getTime() : 0
      const t2 = b.createTimeText ? new Date(b.createTimeText.replace(/-/g, '/')).getTime() : 0
      return t2 - t1
    })

    return {
      success: true,
      data: list,
      stats: {
        totalOrders: list.length,
        paidCount,
        totalSpent: fmt(totalSpent),
        totalRecharge: fmt(totalRecharge)
      }
    }
  } catch (err) {
    console.error('getUserOrders 查询失败', err)
    return { success: false, error: err.message }
  }
}
