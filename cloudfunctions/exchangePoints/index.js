const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { ruleId, points, type, couponId, productId, name } = event
  const openid = cloud.getWXContext().OPENID

  try {
    const userRes = await db.collection('user').where({ _openid: openid }).get()
    if (!userRes.data.length) throw new Error('用户不存在')
    const user = userRes.data[0]
    const currentPoints = user.points || 0
    if (currentPoints < points) throw new Error('积分不足')

    let couponData = null
    const expireTime = new Date()
    expireTime.setDate(expireTime.getDate() + 30)

    if (type === 'coupon' && couponId) {
      const couponRes = await db.collection('coupon').doc(couponId).get()
      if (!couponRes.data) throw new Error('优惠券模板不存在')
      const template = couponRes.data
      const days = template.expireDays || 30
      const couponExpire = new Date()
      couponExpire.setDate(couponExpire.getDate() + days)
      couponData = {
        _openid: openid,
        couponId: couponId,
        name: template.name,
        type: template.type,
        condition: template.condition || 0,
        value: template.value || 0,
        discount: template.discount || 0,
        productId: template.productId || '',
        productName: template.productName || '',
        used: false,
        source: 'point_exchange',
        expireTime: couponExpire,
        createTime: db.serverDate()
      }
    } else if (type === 'product' && productId) {
      const dishRes = await db.collection('dish').doc(productId).get()
      if (!dishRes.data) throw new Error('商品不存在')
      const dish = dishRes.data
      couponData = {
        _openid: openid,
        type: 'product',
        name: `【商品券】${dish.name}`,
        productId: productId,
        productName: dish.name,
        used: false,
        source: 'point_exchange',
        expireTime: expireTime,
        createTime: db.serverDate()
      }
    } else {
      throw new Error('无效的兑换类型')
    }

    await db.collection('user_coupons').add({ data: couponData })
    await db.collection('user').doc(user._id).update({ data: { points: currentPoints - points } })
    await db.collection('points_log').add({
      data: {
        _openid: openid,
        type: 'spend',
        amount: -points,
        reason: `兑换 ${name}`,
        ruleId: ruleId,
        createTime: db.serverDate()
      }
    })

    return { success: true }
  } catch (err) {
    console.error('兑换失败', err)
    return { success: false, error: err.message }
  }
}