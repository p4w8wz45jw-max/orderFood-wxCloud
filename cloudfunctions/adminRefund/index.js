// 云函数：adminRefund - 订单退款
// 余额支付：退回用户余额
// 微信支付：调用 cloud.cloudPay.refund() 原路退回
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { orderId } = event

  if (!orderId) {
    return { success: false, error: '缺少订单ID' }
  }

  try {
    // 1. 查询订单
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) {
      return { success: false, error: '订单不存在' }
    }
    const order = orderRes.data

    // 2. 检查订单状态（兼容 payStatus 和旧版 pay_status 命名）
    if (order.status === 'refunded' || order.status === 4) {
      return { success: false, error: '该订单已退款' }
    }
    // 防御性检查：如果已有 refundTime 记录，说明已退款
    if (order.refundTime) {
      return { success: false, error: '该订单已退款（已有退款记录）' }
    }
    const effectivePayStatus = order.payStatus || order.pay_status || false
    // 允许未支付但已扣余额的订单（用户取消微信支付场景）退回余额
    const isCancelledPayment = !effectivePayStatus && order.status === 'pending' && (order.balancePaid > 0)
    if (!isCancelledPayment) {
      if (!effectivePayStatus && order.status !== 'paid') {
        return { success: false, error: '该订单未支付，无法退款' }
      }
    }
    if (order.type === 'recharge') {
      return { success: false, error: '充值订单暂不支持退款' }
    }
    if (order.useMiandan) {
      return { success: false, error: '免单订单无需退款' }
    }

    // 3. 先锁定订单（乐观锁），防止并发重复退款
    const lockRes = await db.collection('order').where({
      _id: orderId,
      status: _.nin(['refunded', 'cancelled', 'refunding'])
    }).update({
      data: {
        status: 'refunding'
      }
    })

    if (lockRes.stats.updated === 0) {
      return { success: false, error: '该订单已退款或正在退款中' }
    }

    const balancePaid = order.balancePaid || 0
    const wechatPaid = isCancelledPayment ? 0 : (order.wechatPaid || 0)
    let refundResults = []

    // 4. 处理余额退款
    if (balancePaid > 0) {
      const userRes = await db.collection('user').where({ _openid: order._openid }).get()
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        // 精确到分累加，避免浮点累加误差
        const newBalance = Math.round((user.balance + balancePaid) * 100) / 100
        await db.collection('user').doc(user._id).update({
          data: { balance: newBalance }
        })
        // 记录余额变动日志（容错：集合不存在不影响退款）
        db.collection('balance_log').add({
          data: {
            _openid: order._openid,
            type: 'refund',
            amount: balancePaid,
            description: `订单退款 +¥${balancePaid.toFixed(2)}（余额退回）`,
            orderId: orderId,
            createTime: db.serverDate()
          }
        }).catch(err => console.error('记录balance_log失败（不影响退款）:', err.message))
        refundResults.push(`余额退款 ¥${balancePaid.toFixed(2)} 已退回用户余额`)
      } else {
        refundResults.push(`余额退款失败：用户不存在`)
      }
    }

    // 5. 处理微信支付退款
    if (wechatPaid > 0) {
      try {
        // 获取支付配置中的商户号
        let subMchId = ''
        try {
          const payConfigRes = await db.collection('payConfig').limit(1).get()
          if (payConfigRes.data && payConfigRes.data.length > 0) {
            subMchId = payConfigRes.data[0].mchId || ''
          }
        } catch (e) {
          console.log('获取支付配置失败，将使用默认商户号', e)
        }

        // 生成退款单号
        const outRefundNo = `RF${orderId}${Date.now()}`

        // 调用微信支付退款接口（金额单位：分）
        const refundFee = Math.round(wechatPaid * 100)
        const totalFee = Math.round(wechatPaid * 100)

        const refundRes = await cloud.cloudPay.refund({
          subMchId: subMchId || undefined,
          outTradeNo: orderId,
          outRefundNo: outRefundNo,
          totalFee: totalFee,
          refundFee: refundFee
        })

        if (refundRes.returnCode === 'SUCCESS' && refundRes.resultCode === 'SUCCESS') {
          refundResults.push(`微信退款 ¥${wechatPaid.toFixed(2)} 已原路退回`)
        } else {
          // 微信退款失败，尝试退回余额作为保底方案
          console.error('微信退款失败:', refundRes)
          const userRes = await db.collection('user').where({ _openid: order._openid }).get()
          if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0]
            // 精确到分累加，避免浮点累加误差
            const newBalance = Math.round((user.balance + wechatPaid) * 100) / 100
            await db.collection('user').doc(user._id).update({
              data: { balance: newBalance }
            })
            db.collection('balance_log').add({
              data: {
                _openid: order._openid,
                type: 'refund',
                amount: wechatPaid,
                description: `订单退款 +¥${wechatPaid.toFixed(2)}（微信退款转余额）`,
                orderId: orderId,
                createTime: db.serverDate()
              }
            }).catch(err => console.error('记录balance_log失败（不影响退款）:', err.message))
            refundResults.push(`微信退款接口失败，¥${wechatPaid.toFixed(2)} 已退回用户余额（保底方案）`)
          } else {
            refundResults.push(`微信退款失败：${refundRes.returnMsg || refundRes.errCodeDes || '未知错误'}`)
          }
        }
        } catch (wxRefundErr) {
          console.error('微信退款异常:', wxRefundErr)
          // 微信退款异常，退回余额作为保底
          try {
            const userRes = await db.collection('user').where({ _openid: order._openid }).get()
            if (userRes.data && userRes.data.length > 0) {
              const user = userRes.data[0]
              // 精确到分累加，避免浮点累加误差
              const newBalance = Math.round((user.balance + wechatPaid) * 100) / 100
              await db.collection('user').doc(user._id).update({
                data: { balance: newBalance }
              })
            db.collection('balance_log').add({
              data: {
                _openid: order._openid,
                type: 'refund',
                amount: wechatPaid,
                description: `订单退款 +¥${wechatPaid.toFixed(2)}（微信退款异常转余额）`,
                orderId: orderId,
                createTime: db.serverDate()
              }
            }).catch(err => console.error('记录balance_log失败（不影响退款）:', err.message))
            refundResults.push(`微信退款接口异常，¥${wechatPaid.toFixed(2)} 已退回用户余额`)
          }
        } catch (balanceErr) {
          refundResults.push(`退款异常：${wxRefundErr.message}`)
        }
      }
    }

    // 6. 更新订单状态为最终结果
    const newStatus = isCancelledPayment ? 'cancelled' : 'refunded'
    await db.collection('order').doc(orderId).update({
      data: {
        status: newStatus,
        refundTime: db.serverDate(),
        refundResult: refundResults.join('；')
      }
    })

    // 7. 扣除该订单赠送的积分（异步，不影响退款流程）
    deductRefundPoints(orderId).catch(err => {
      console.error('扣除退款订单积分失败（不影响退款流程）', err)
    })

    // 8. 恢复该订单使用的优惠券为未使用（异步，不影响退款流程）
    // 取消支付场景优惠券未被标记，此处幂等恢复无副作用
    restoreCouponForOrder(orderId).catch(err => {
      console.error('恢复退款订单优惠券失败（不影响退款流程）', err)
    })

    return {
      success: true,
      message: refundResults.join('；'),
      refundDetails: refundResults
    }

  } catch (err) {
    console.error('退款失败', err)
    return { success: false, error: err.message || '退款处理失败' }
  }
}

// 退款后恢复该订单使用的优惠券为未使用（幂等：重复设置 used:false 无害）
async function restoreCouponForOrder(orderId) {
  try {
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) return
    const order = orderRes.data
    const couponId = order.usedCouponId
    if (!couponId) return

    await db.collection('user_coupons').doc(couponId).update({
      data: { used: false }
    })
    console.log(`订单 ${orderId} 退款，恢复优惠券 ${couponId} 为未使用`)
  } catch (err) {
    // 优惠券文档可能已被管理员删除，忽略该错误
    console.error('restoreCouponForOrder 失败', err.message)
  }
}

// 退款后扣除该订单赠送的积分
async function deductRefundPoints(orderId) {
  try {
    // 查找该订单的积分获取记录
    const pointsRes = await db.collection('points_log')
      .where({ orderId: orderId, type: 'earn' })
      .get()
    if (!pointsRes.data || pointsRes.data.length === 0) {
      return  // 该订单没有积分记录，无需扣除
    }

    // 检查是否已扣除过（幂等保护）
    const deductExist = await db.collection('points_log')
      .where({ orderId: orderId, type: 'refund_deduct' })
      .get()
    if (deductExist.data && deductExist.data.length > 0) {
      console.log(`订单 ${orderId} 积分已扣除过，跳过`)
      return
    }

    const earnedLog = pointsRes.data[0]
    const earnedPoints = earnedLog.amount || 0
    if (earnedPoints <= 0) return

    const openid = earnedLog._openid

    // 扣除用户积分
    const userRes = await db.collection('user').where({ _openid: openid }).get()
    if (userRes.data && userRes.data.length > 0) {
      const user = userRes.data[0]
      const currentPoints = user.points || 0
      // 防止积分扣成负数
      const deductAmount = Math.min(earnedPoints, currentPoints)
      await db.collection('user').doc(user._id).update({
        data: { points: db.command.inc(-deductAmount) }
      })
    }

    // 记录积分扣除日志
    await db.collection('points_log').add({
      data: {
        _openid: openid,
        type: 'refund_deduct',
        amount: -earnedPoints,
        description: `订单退款，扣除${earnedPoints}积分`,
        orderId: orderId,
        createTime: db.serverDate()
      }
    })

    console.log(`订单 ${orderId} 退款，扣除 ${earnedPoints} 积分`)
  } catch (err) {
    console.error('deductRefundPoints 失败', err)
  }
}
