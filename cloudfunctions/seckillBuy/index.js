// cloudfunctions/seckillBuy/index.js
// 秒杀下单云函数（含微信支付）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ⚠️ 请替换为你的微信支付商户号和云环境ID
const MCH_ID = 'your-mch-id'
const ENV_ID = 'your-env-id'

exports.main = async (event) => {
  // 微信支付成功回调
  if (event.returnCode === 'SUCCESS' && event.outTradeNo) {
    return await handlePayCallback(event)
  }
  // 用户取消/失败回滚
  if (event.action === 'cancel' && event.outTradeNo) {
    return await cancelSeckillOrder(event)
  }
  // 小程序主动创建秒杀订单
  return await createSeckillOrder(event)
}

// 确保 seckill_order 集合存在
async function ensureSeckillOrderCollection() {
  try {
    await db.createCollection('seckill_order')
  } catch (err) {
    // -502002 表示集合已存在，可忽略
    if (err && err.errCode !== -502002 && !(err.message && err.message.includes('already exists'))) {
      console.error('创建 seckill_order 集合异常', err)
    }
  }
}

// 创建秒杀订单并发起微信支付
async function createSeckillOrder(event) {
  const { seckillId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 查询秒杀活动
    const seckillRes = await db.collection('seckill').doc(seckillId).get()
    if (!seckillRes.data) {
      return { success: false, error: '秒杀活动不存在' }
    }
    const seckill = seckillRes.data

    // 2. 检查活动状态
    if (!seckill.enable) {
      return { success: false, error: '秒杀活动已关闭' }
    }
    const now = new Date()
    const startTime = new Date(seckill.startTime)
    const endTime = new Date(seckill.endTime)
    if (now < startTime) {
      return { success: false, error: '秒杀活动尚未开始' }
    }
    if (now > endTime) {
      return { success: false, error: '秒杀活动已结束' }
    }

    // 3. 检查库存
    const stock = seckill.stock || 0
    const soldCount = seckill.soldCount || 0
    if (soldCount >= stock) {
      return { success: false, error: '秒杀商品已售罄' }
    }

    // 4. 检查用户是否已购买过该秒杀商品（先确保集合存在）
    await ensureSeckillOrderCollection()
    const existRes = await db.collection('seckill_order')
      .where({ _openid: openid, seckillId: seckillId, status: 'paid' })
      .count()
    if (existRes.total > 0) {
      return { success: false, error: '每个用户限购一次，您已购买过该秒杀商品' }
    }

    // 5. 获取用户信息
    const userRes = await db.collection('user').where({ _openid: openid }).get()
    if (!userRes.data.length) {
      return { success: false, error: '用户不存在，请先登录' }
    }
    const user = userRes.data[0]

    // 6. 获取优惠券模板
    const couponRes = await db.collection('coupon').doc(seckill.couponId).get()
    if (!couponRes.data) {
      return { success: false, error: '秒杀商品券已失效' }
    }
    const couponTemplate = couponRes.data

    // 7. 原子扣减库存（预占）
    const lockRes = await db.collection('seckill').where({
      _id: seckillId,
      soldCount: _.lt(stock)
    }).update({
      data: { soldCount: _.inc(1) }
    })
    if (lockRes.stats.updated === 0) {
      return { success: false, error: '下手慢了一步，秒杀商品已售罄' }
    }

    // 8. 生成订单号
    const outTradeNo = `SK${Date.now()}${Math.floor(Math.random() * 1000)}`

    // 9. 创建未支付订单
    await db.collection('seckill_order').add({
      data: {
        _openid: openid,
        seckillId: seckillId,
        userId: user._id,
        title: seckill.title || '',
        price: seckill.price || 0,
        couponId: seckill.couponId,
        couponName: couponTemplate.name || '',
        imageUrl: seckill.imageUrl || '',
        status: 'unpaid',
        outTradeNo: outTradeNo,
        createTime: db.serverDate()
      }
    })

    // 10. 金额为0时直接发放优惠券
    const totalFee = Math.round((seckill.price || 0) * 100)
    if (totalFee <= 0) {
      await fulfillSeckillOrder(outTradeNo)
      return { success: true, message: '秒杀成功！优惠券已发放到您的账户', free: true }
    }

    // 11. 调用微信支付统一下单
    const payRes = await cloud.cloudPay.unifiedOrder({
      body: seckill.title || '秒杀商品',
      outTradeNo: outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: MCH_ID,
      totalFee: totalFee,
      envId: ENV_ID,
      functionName: 'seckillBuy',
      tradeType: 'JSAPI',
      openid: openid
    })

    if (payRes.returnCode === 'SUCCESS' && payRes.resultCode === 'SUCCESS') {
      return {
        success: true,
        payment: payRes.payment,
        outTradeNo: outTradeNo
      }
    } else {
      // 支付下单失败，回滚库存并取消订单
      await rollbackSeckillOrder(outTradeNo, '支付下单失败')
      const errorMsg = payRes.errCodeDes || payRes.returnMsg || '支付下单失败'
      return { success: false, error: errorMsg }
    }
  } catch (err) {
    console.error('创建秒杀订单失败', err)
    return { success: false, error: err.message || '秒杀失败' }
  }
}

// 微信支付成功回调
async function handlePayCallback(event) {
  const outTradeNo = event.outTradeNo
  try {
    await fulfillSeckillOrder(outTradeNo)
    return { errcode: 0, errmsg: 'ok' }
  } catch (err) {
    console.error('秒杀支付回调处理失败', err)
    return { errcode: 1, errmsg: err.message || 'fail' }
  }
}

// 完成秒杀订单：发放优惠券
async function fulfillSeckillOrder(outTradeNo) {
  const orderRes = await db.collection('seckill_order').where({ outTradeNo: outTradeNo }).get()
  if (!orderRes.data || orderRes.data.length === 0) {
    console.log('未找到秒杀订单', outTradeNo)
    return
  }
  const order = orderRes.data[0]
  if (order.status === 'paid') {
    return
  }

  const couponRes = await db.collection('coupon').doc(order.couponId).get()
  if (!couponRes.data) {
    throw new Error('优惠券模板不存在')
  }
  const couponTemplate = couponRes.data

  const expireTime = new Date()
  expireTime.setDate(expireTime.getDate() + (couponTemplate.expireDays || 30))

  const couponAddRes = await db.collection('user_coupons').add({
    data: {
      _openid: order._openid,
      couponId: order.couponId,
      name: couponTemplate.name,
      type: couponTemplate.type,
      value: couponTemplate.value || 0,
      condition: couponTemplate.condition || 0,
      discount: couponTemplate.discount || 0,
      productId: couponTemplate.productId || '',
      productName: couponTemplate.productName || '',
      seckillPrice: order.price || 0,
      seckillOrderId: order._id,
      expireTime: expireTime,
      used: false,
      createTime: db.serverDate(),
      source: 'seckill'
    }
  })

  await db.collection('seckill_order').doc(order._id).update({
    data: {
      status: 'paid',
      payTime: db.serverDate(),
      userCouponId: couponAddRes._id
    }
  })
}

// 取消秒杀订单（回滚库存）
async function cancelSeckillOrder(event) {
  const { outTradeNo } = event
  try {
    await rollbackSeckillOrder(outTradeNo, '用户取消支付')
    return { success: true }
  } catch (err) {
    console.error('取消秒杀订单失败', err)
    return { success: false, error: err.message || '取消失败' }
  }
}

// 回滚库存并标记订单为 cancelled
async function rollbackSeckillOrder(outTradeNo, reason) {
  const orderRes = await db.collection('seckill_order').where({ outTradeNo: outTradeNo }).get()
  if (!orderRes.data || orderRes.data.length === 0) return
  const order = orderRes.data[0]
  if (order.status !== 'unpaid') return

  await db.collection('seckill').doc(order.seckillId).update({
    data: { soldCount: _.inc(-1) }
  })
  await db.collection('seckill_order').doc(order._id).update({
    data: {
      status: 'cancelled',
      cancelReason: reason || '',
      cancelTime: db.serverDate()
    }
  })
}
