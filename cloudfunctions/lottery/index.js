const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (action === 'draw') {
    // 获取用户剩余次数
    let userRes = await db.collection('user').where({ _openid: openid }).get()
    let userId = null
    let lotteryChance = 0
    if (userRes.data.length === 0) {
      const addRes = await db.collection('user').add({
        data: { _openid: openid, lotteryChance: 0, balance: 0, createTime: new Date() }
      })
      userId = addRes._id
      lotteryChance = 0
    } else {
      userId = userRes.data[0]._id
      lotteryChance = userRes.data[0].lotteryChance || 0
    }

    if (lotteryChance <= 0) {
      return { code: -1, message: '抽奖机会不足，请下单获取' }
    }

    // 获取抽奖配置
    const configRes = await db.collection('lottery_config').doc('config').get()
    const config = configRes.data
    if (!config || !config.enable) {
      return { code: -1, message: '抽奖活动未开启' }
    }

    // 抽奖算法
    const prizes = config.rules
    let totalProb = prizes.reduce((sum, p) => sum + (p.probability || 0), 0)
    let rand = Math.random() * totalProb
    let selected = null
    for (let p of prizes) {
      if (rand < p.probability) {
        selected = p
        break
      }
      rand -= p.probability
    }
    if (!selected) {
      return { code: -1, message: '抽奖失败' }
    }

    // 消耗一次机会
    await db.collection('user').doc(userId).update({
      data: { lotteryChance: _.inc(-1) }
    })

    // 记录抽奖结果（含奖品类型，中奖券时记录发放的券 ID）
    const recordData = {
      _openid: openid,
      prize: selected.name,
      type: selected.type || '',
      createTime: new Date()
    }

    // 如果奖品是优惠券或商品券，发放到 user_coupons
    if ((selected.type === 'coupon' || selected.type === 'product') && selected.couponId) {
      const templateRes = await db.collection('coupon').doc(selected.couponId).get()
      const template = templateRes.data
      if (template && template.enable) {
        const expireTime = new Date()
        expireTime.setDate(expireTime.getDate() + (template.expireDays || 30))
        const userCouponData = {
          _openid: openid,
          couponId: selected.couponId,
          name: template.name,
          type: template.type,
          expireTime: expireTime,
          used: false,
          source: 'lottery',
          createTime: new Date()
        }
        if (template.type === 'product') {
          userCouponData.productId = template.productId
          userCouponData.productName = template.productName
        } else if (template.type === 'full_reduction') {
          userCouponData.condition = template.condition
          userCouponData.value = template.value
        } else if (template.type === 'discount') {
          userCouponData.discount = template.discount
        }
        const couponAddRes = await db.collection('user_coupons').add({ data: userCouponData })
        recordData.couponId = couponAddRes._id
      }
    }

    await db.collection('lottery_records').add({ data: recordData })

    return {
      code: 0,
      data: { name: selected.name, type: selected.type },
      message: '抽奖成功'
    }
  }

  if (action === 'records') {
    // 查询当前用户的抽奖记录（倒序，最多 50 条）
    const limit = Math.min(event.limit || 50, 100)
    const res = await db.collection('lottery_records')
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()
    const list = res.data || []

    // 批量查询记录中发放的优惠券，补充使用状态
    const couponIds = list.filter(r => r.couponId).map(r => r.couponId)
    const couponMap = {}
    if (couponIds.length > 0) {
      try {
        const couponRes = await db.collection('user_coupons')
          .where({ _id: _.in(couponIds) })
          .get()
        couponRes.data.forEach(c => { couponMap[c._id] = c })
      } catch (err) {
        console.error('查询记录优惠券状态失败', err)
      }
    }

    const records = list.map(r => {
      const c = couponMap[r.couponId]
      let couponStatus = ''
      if (c) {
        if (c.used) {
          couponStatus = '已使用'
        } else if (c.expireTime && new Date(c.expireTime).getTime() < Date.now()) {
          couponStatus = '已过期'
        } else {
          couponStatus = '未使用'
        }
      }
      return {
        _id: r._id,
        prize: r.prize,
        type: r.type || '',
        couponStatus,
        timeText: formatTime(r.createTime)
      }
    })

    return { code: 0, data: records }
  }
  return { code: -1, message: '未知操作' }
}

// 将日期格式化为 YYYY-MM-DD HH:mm
function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}