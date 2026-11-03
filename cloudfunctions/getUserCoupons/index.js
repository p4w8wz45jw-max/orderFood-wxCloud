// 云函数：getUserCoupons
// 后台会员管理用：按 openid 查询某用户的全部优惠券（含来源、状态、时间）
// 客户端直查 user_coupons 受权限限制（管理员查不到他人优惠券），必须走云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const SOURCE_TEXT = {
  invite_reward: '邀请有奖',
  new_user_gift: '新用户赠礼',
  seckill: '限时秒杀',
  lottery: '幸运抽奖',
  point_exchange: '积分兑换',
  admin_gift: '管理员赠送',
  ticket_package: '优惠券中心'
}

exports.main = async (event) => {
  const { openid } = event
  if (!openid) {
    return { success: false, error: '缺少 openid' }
  }
  try {
    // 分页读取该用户全部优惠券
    const MAX_LIMIT = 1000
    let coupons = []
    let skip = 0
    while (true) {
      const res = await db.collection('user_coupons')
        .where({ _openid: openid })
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()
      coupons = coupons.concat(res.data)
      if (res.data.length < MAX_LIMIT) break
      skip += MAX_LIMIT
    }

    const now = Date.now()
    const toTs = (t) => (t ? new Date(t).getTime() : 0)
    const formatTime = (t) => {
      if (!t) return ''
      const d = new Date(t)
      const pad = (n) => (n < 10 ? '0' + n : n)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const list = coupons.map(c => {
      const expired = !c.used && c.expireTime && toTs(c.expireTime) < now
      let status = 'unused'
      let statusText = '未使用'
      if (c.used) {
        status = 'used'
        statusText = '已使用'
      } else if (expired) {
        status = 'expired'
        statusText = '已过期'
      }
      return {
        _id: c._id,
        name: c.name || '',
        type: c.type || '',
        typeText: c.type === 'full_reduction' ? '满减券' : c.type === 'discount' ? '折扣券' : c.type === 'product' ? '商品券' : c.type || '',
        value: c.value || 0,
        condition: c.condition || 0,
        discount: c.discount || 0,
        productName: c.productName || '',
        source: c.source || '',
        sourceText: SOURCE_TEXT[c.source] || (c.source ? c.source : '未知来源'),
        status,
        statusText,
        createTimeText: formatTime(c.createTime),
        usedTimeText: formatTime(c.usedTime),
        expireTimeText: formatTime(c.expireTime)
      }
    })

    // 统计
    const stats = {
      total: list.length,
      unused: list.filter(c => c.status === 'unused').length,
      used: list.filter(c => c.status === 'used').length,
      expired: list.filter(c => c.status === 'expired').length
    }

    return { success: true, data: list, stats }
  } catch (err) {
    console.error('getUserCoupons 查询失败', err)
    return { success: false, error: err.message }
  }
}
