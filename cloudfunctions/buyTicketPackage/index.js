const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { packageId, price, couponId, couponCount, couponName, expireDays } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 获取支付配置（商户号等）
    const payConfigRes = await db.collection('payConfig').limit(1).get()
    if (!payConfigRes.data.length) {
      return { success: false, error: '请先在后台配置支付参数' }
    }
    const payConfig = payConfigRes.data[0]
    if (!payConfig.mchId) {
      return { success: false, error: '支付配置缺少商户号，请填写' }
    }

    // 2. 获取用户信息
    const userRes = await db.collection('user').where({ _openid: openid }).get()
    if (!userRes.data.length) {
      return { success: false, error: '用户不存在' }
    }
    const user = userRes.data[0]

    // 3. 获取优惠券模板
    const couponRes = await db.collection('coupon').doc(couponId).get()
    if (!couponRes.data) {
      return { success: false, error: '优惠券模板不存在' }
    }
    const template = couponRes.data

    // 4. 创建订单记录
    const orderRes = await db.collection('order').add({
      data: {
        type: 'ticket_package',
        packageId: packageId,
        price: price,
        couponId: couponId,
        couponCount: couponCount,
        couponName: couponName,
        pay_status: false,
        status: 0,
        createTime: db.serverDate(),
        userNickName: user.nickName || '',
        userAvatar: user.avatarUrl || '',
        userPhone: user.phoneNumber || ''
      }
    })
    const orderId = orderRes._id

    // 5. 调用微信支付统一下单（使用动态商户号）
    const payResult = await cloud.cloudPay.unifiedOrder({
      body: `购买套票：${couponName} x${couponCount}`,
      outTradeNo: orderId,
      spbillCreateIp: '127.0.0.1',
      subMchId: payConfig.mchId,               // 从数据库读取商户号
      totalFee: price * 100,
      envId: cloud.DYNAMIC_CURRENT_ENV,        // 自动使用当前云环境
      functionName: 'payCallback',             // 支付回调云函数名
      tradeType: 'JSAPI',
      openid: openid
    })

    if (payResult.returnCode !== 'SUCCESS' || payResult.resultCode !== 'SUCCESS') {
      // 支付下单失败，删除订单
      await db.collection('order').doc(orderId).remove()
      return { success: false, error: payResult.returnMsg || '支付下单失败' }
    }

    // 6. 返回支付参数给前端
    const payment = {
      timeStamp: payResult.timeStamp,
      nonceStr: payResult.nonceStr,
      package: payResult.package,
      signType: payResult.signType,
      paySign: payResult.paySign
    }

    return { success: true, payment: payment, orderId: orderId }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}