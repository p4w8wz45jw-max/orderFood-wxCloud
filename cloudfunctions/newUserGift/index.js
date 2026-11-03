// 云函数：新用户赠礼
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { openid } = event
  const wxContext = cloud.getWXContext()
  const uid = openid || wxContext.OPENID
  if (!uid) return { success: false, msg: '缺少openid' }

  try {
    // 1. 读取配置
    const configRes = await db.collection('config').doc('new_user_gift').get()
    const config = configRes.data
    if (!config || !config.enable || !config.couponId) {
      return { success: false, msg: '新用户赠礼未开启或未配置' }
    }

    // 2. 检查是否已领取过
    const receivedRes = await db.collection('user_coupons')
      .where({ _openid: uid, source: 'new_user_gift' })
      .count()
    if (receivedRes.total > 0) {
      return { success: false, msg: '已领取过新用户赠礼', alreadyReceived: true }
    }

    // 3. 获取优惠券模板
    const couponRes = await db.collection('coupon').doc(config.couponId).get()
    if (!couponRes.data) {
      return { success: false, msg: '优惠券模板不存在' }
    }
    const coupon = couponRes.data

    // 4. 计算过期时间
    const expireDays = coupon.expireDays || 30
    const now = new Date()
    const expireTime = new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000)

    // 5. 发放优惠券给用户
    const userCoupon = {
      _openid: uid,
      couponId: coupon._id,
      name: coupon.name,
      type: coupon.type,
      condition: coupon.condition || 0,
      value: coupon.value || 0,
      discount: coupon.discount || 0,
      productId: coupon.productId || '',
      productName: coupon.productName || '',
      expireDays: expireDays,
      expireTime: expireTime,
      used: false,
      source: 'new_user_gift',
      createTime: now
    }

    await db.collection('user_coupons').add({ data: userCoupon })

    return {
      success: true,
      msg: '领取成功',
      coupon: {
        name: coupon.name,
        type: coupon.type,
        condition: coupon.condition,
        value: coupon.value,
        discount: coupon.discount
      }
    }
  } catch (err) {
    console.error('新用户赠礼失败', err)
    return { success: false, msg: '发放失败', error: err.message }
  }
}
