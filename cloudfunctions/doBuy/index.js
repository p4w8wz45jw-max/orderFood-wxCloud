// cloudfunctions/doBuy/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { 
    orderGoods, totalPrice, finalPrice, useMiandan, payWithBalance, 
    orderType, deliveryFee, shippingAddress, tableNumber, selectedTime,
    balancePayAmount, wechatPayAmount, couponId, couponName, couponType,
    couponSource, inviterOpenid, balanceDiscount, balanceOriginalTotal
  } = event
  
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    let actualBalancePay = balancePayAmount || 0
    let actualWechatPay = wechatPayAmount || 0
    // finalPrice 已在小程序端包含了配送费，此处不再重复添加
    let totalPay = finalPrice || 0

    // 获取用户信息（先查询，以便写入订单）
    const userRes = await db.collection('user').where({ _openid: openid }).get()
    if (!userRes.data.length) {
      throw new Error('用户不存在')
    }
    const user = userRes.data[0]
    const userId = user._id
    const currentBalance = user.balance || 0

    // 创建订单（保存用户头像、昵称、手机号）
    const order = {
      _openid: openid,
      type: 'order',
      outTradeNo: '',  // 稍后填写
      goodsList: orderGoods,
      totalPrice: totalPrice,
      finalPrice: totalPay,
      useMiandan: useMiandan || false,
      payWithBalance: payWithBalance || false,
      orderType: orderType || 'dineIn',
      deliveryFee: deliveryFee || 0,
      shippingAddress: shippingAddress || null,
      tableNumber: tableNumber || '',
      payStatus: false,
      status: 'pending',
      createTime: db.serverDate(),
      selectedTime: selectedTime || '立即',
      balancePaid: actualBalancePay,
      wechatPaid: actualWechatPay,
      usedCouponId: couponId || null,
      couponName: couponName || '',
      couponType: couponType || '',
      couponSource: couponSource || '',
      inviterOpenid: inviterOpenid || '',
      userAvatar: user.avatarUrl || '',
      userNickName: user.nickName || '',
      userPhone: user.phoneNumber || '',
      balanceDiscount: balanceDiscount || 0,
      balanceOriginalTotal: balanceOriginalTotal || 0
    }
    const orderRes = await db.collection('order').add({ data: order })
    const orderId = orderRes._id

    // 处理余额支付部分
    if (actualBalancePay > 0) {
      if (currentBalance > 0) {
        // 实际可用的余额（最多扣到0）
        const actualDeduct = Math.min(actualBalancePay, currentBalance)
        // 精确到分扣减，避免浮点累加误差（如 21.5 - 0.05 = 21.450000000000003）
        const newBalance = Math.round((currentBalance - actualDeduct) * 100) / 100
        await db.collection('user').doc(userId).update({
          data: { balance: newBalance }
        })
        // 记录余额变动日志（容错：集合不存在不影响下单）
        db.collection('balance_log').add({
          data: {
            _openid: openid,
            type: 'order_pay',
            amount: -actualDeduct,
            description: `点餐消费 -¥${actualDeduct.toFixed(2)}`,
            orderId: orderId,
            createTime: db.serverDate()
          }
        }).catch(err => console.error('记录balance_log失败（不影响下单）:', err.message))
        console.log(`用户 ${openid} 余额支付 ${actualDeduct} 元`)

        // 余额不足部分转到微信支付补差价
        if (actualDeduct < actualBalancePay) {
          const shortfall = actualBalancePay - actualDeduct
          actualWechatPay += shortfall
          actualBalancePay = actualDeduct
          // 更新订单中的支付金额
          await db.collection('order').doc(orderId).update({
            data: { balancePaid: actualBalancePay, wechatPaid: actualWechatPay }
          })
          console.log(`余额不足，差额 ¥${shortfall.toFixed(2)} 转微信支付补差价，总微信支付 ¥${actualWechatPay.toFixed(2)}`)
        }
      } else {
        // 余额为0，全部转微信支付
        const amountToWechat = actualBalancePay
        actualWechatPay += amountToWechat
        actualBalancePay = 0
        // 更新订单中的支付金额
        await db.collection('order').doc(orderId).update({
          data: { balancePaid: 0, wechatPaid: actualWechatPay }
        })
        console.log(`余额为0，¥${amountToWechat.toFixed(2)} 全部转微信支付，总微信支付 ¥${actualWechatPay.toFixed(2)}`)
      }
    }

    // 标记订单为已支付（实际支付需等待回调）
    // 注意：此处不修改 payStatus，等待支付回调更新
    // 如果 wechatPayAmount == 0，说明不需要微信支付，直接标记支付成功
    if (actualWechatPay === 0) {
      await db.collection('order').doc(orderId).update({
        data: { payStatus: true, status: 'paid' }
      })
      // 如果订单使用了优惠券且无需微信支付，在此立即标记优惠券为已使用
      if (couponId) {
        await db.collection('user_coupons').doc(couponId).update({
          data: { used: true, usedTime: db.serverDate() }
        })
      }
      // 处理邀请奖励（无需微信支付的订单支付完成时）
      await processInviteReward(openid, inviterOpenid, orderId, db, _)
      // 异步打印订单（纯余额支付，不走支付回调）
      printOrderForDoBuy(orderId).catch(err => {
        console.error('打印订单失败（不影响下单）:', err.message)
      })
    }

    return { success: true, orderId: orderId, outTradeNo: orderId, needPay: actualWechatPay > 0 }
  } catch (err) {
    console.error('创建订单失败', err)
    return { success: false, error: err.message }
  }
}

// 打印订单（doBuy 余额支付触发）
async function printOrderForDoBuy(orderId) {
  try {
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data || orderRes.data.type !== 'order') return
    const order = orderRes.data

    const printerRes = await db.collection('printer').limit(1).get()
    if (!printerRes.data || printerRes.data.length === 0) {
      console.log('未绑定打印机，跳过打印')
      return
    }
    const sn = printerRes.data[0].sn

    const shopRes = await db.collection('shopinfo').limit(1).get()
    const shopName = shopRes.data[0]?.name || '餐饮店'
    const printTemplate = shopRes.data[0]?.printTemplate || 'default'

    // 根据模板生成打印内容（使用 HTML 标签格式）
    let content
    if (printTemplate === 'simple') {
      // 精简模板：大字店名、商品名、取餐/配送时间、价格
      content = '<C></C><BR>'
        + '<C></C><BR>'
        + '<C><font# bolder=1 height=4 width=4>' + shopName + '</font#></C><BR>'
        + '<BR>'
      if (order.goodsList && order.goodsList.length) {
        order.goodsList.forEach(item => {
          const name = (item.dishName && item.dishName.length > 12) ? item.dishName.slice(0, 10) + '..' : (item.dishName || '')
          const price = (item.price || 0).toFixed(2)
          content += '<LEFT>' + name + '        ×' + item.count + '      ￥' + price + '</LEFT><BR>'
        })
      }
      content += '<BR>'
      const timeLabel = order.orderType === 'takeout' ? '配送时间' : '取餐时间'
      const timeValue = order.selectedTime || ''
      content += '<LEFT>' + timeLabel + ': ' + timeValue + '</LEFT><BR>'
      // 配送地址
      if (order.orderType === 'takeout' && order.shippingAddress) {
        const addr = typeof order.shippingAddress === 'string' 
          ? order.shippingAddress 
          : (order.shippingAddress.address || order.shippingAddress.detail || '')
        if (addr) {
          content += '<LEFT>配送地址: ' + addr + '</LEFT><BR>'
        }
      }
      content += '<BR>'
      content += '<RIGHT><font# bolder=0 height=2 width=1>实付  ￥' + (order.finalPrice || 0).toFixed(2) + '</font#></RIGHT><BR>'
      content += '<C></C><BR>'
      content += '<C></C><BR>'
    } else {
      // 默认模板：完整信息
      const date = new Date(order.createTime)
      content = '<C><font# bolder=1 height=2 width=2>' + shopName + '</font#></C><BR>'
        + '<C>订单小票</C><BR>'
        + '<LEFT>订单号：' + order._id + '</LEFT><BR>'
        + '<LEFT>时间：' + date.toLocaleString() + '</LEFT><BR>'
        + '<C>--------------------------------</C><BR>'
        + '<C>菜品名称        数量    单价</C><BR>'
      if (order.goodsList && order.goodsList.length) {
        order.goodsList.forEach(item => {
          const name = (item.dishName && item.dishName.length > 12) ? item.dishName.slice(0, 10) + '..' : (item.dishName || '')
          const price = (item.price || 0).toFixed(2)
          const spaces = ' '.repeat(Math.max(1, 14 - name.length))
          content += '<LEFT>' + name + spaces + item.count + '        ￥' + price + '</LEFT><BR>'
        })
      }
      content += '<C>--------------------------------</C><BR>'
        + '<RIGHT>合计：￥' + (order.finalPrice || 0).toFixed(2) + '</RIGHT><BR>'
      // 配送地址
      if (order.orderType === 'takeout' && order.shippingAddress) {
        const addr = typeof order.shippingAddress === 'string' 
          ? order.shippingAddress 
          : (order.shippingAddress.address || order.shippingAddress.detail || '')
        if (addr) {
          content += '<LEFT>配送地址: ' + addr + '</LEFT><BR>'
        }
      }
      content += '<C>感谢惠顾！</C><BR>'
    }

    const voice = order.orderType === 'dineIn' ? '16' : '19'
    const printRes = await cloud.callFunction({
      name: 'printManage',
      data: {
        $url: 'printNote',
        sn, voice, voicePlayTimes: 1, voicePlayInterval: 3,
        content, copies: 1, expiresInSeconds: 7200, outTradeNo: orderId
      }
    })
    if (printRes.result && printRes.result.success) {
      console.log(`订单 ${orderId} 打印成功`)
    } else {
      console.error(`订单 ${orderId} 打印失败`, printRes.result)
    }
  } catch (err) {
    console.error(`订单 ${orderId} 打印异常`, err)
  }
}

// 处理邀请奖励
async function processInviteReward(openid, inviterOpenid, orderId, db, _) {
  if (!inviterOpenid || inviterOpenid === openid) return
  if (inviterOpenid === 'undefined' || inviterOpenid === 'null') return

  try {
    // 检查邀请奖励配置是否开启
    const configRes = await db.collection('config').doc('invite_reward').get()
    if (!configRes.data || !configRes.data.inviteEnabled) {
      console.log('邀请奖励功能未开启')
      return
    }

    const rewardCouponId = configRes.data.rewardCouponId
    if (!rewardCouponId) {
      console.log('未配置奖励优惠券')
      return
    }

    // 检查用户是否为新用户（此前没有支付成功的订单）
    const orderCount = await db.collection('order')
      .where({ _openid: openid, payStatus: true })
      .count()
    // 当前订单是第一笔，所以已经有一笔了。如果count > 1，说明不是新用户
    if (orderCount.total > 1) {
      console.log('用户不是新用户，已有多笔订单')
      return
    }

    // 检查是否已经给该用户发放过邀请奖励（防止重复发放）
    const existingRecord = await db.collection('invite_records')
      .where({ invitedOpenid: openid, status: 'success' })
      .get()
    if (existingRecord.data && existingRecord.data.length > 0) {
      console.log('该用户已领取过邀请奖励')
      return
    }

    // 发放奖励优惠券给新用户（被邀请者）
    const couponTemplate = await db.collection('coupon').doc(rewardCouponId).get()
    if (!couponTemplate.data) {
      console.log('优惠券模板不存在')
      return
    }

    const coupon = couponTemplate.data
    const expireTime = new Date()
    expireTime.setDate(expireTime.getDate() + (coupon.expireDays || 30))

    const userCouponData = {
      _openid: openid,
      couponId: rewardCouponId,
      name: coupon.name,
      type: coupon.type,
      value: coupon.value || 0,
      condition: coupon.condition || 0,
      discount: coupon.discount || 0,
      productId: coupon.productId || '',
      expireTime: expireTime,
      used: false,
      createTime: db.serverDate(),
      source: 'invite_reward'
    }

    await db.collection('user_coupons').add({ data: userCouponData })

    // 记录邀请关系
    await db.collection('invite_records').add({
      data: {
        inviterOpenid: inviterOpenid,
        invitedOpenid: openid,
        orderId: orderId,
        status: 'success',
        rewardCouponId: rewardCouponId,
        rewardGiven: true,
        createTime: db.serverDate()
      }
    })

    console.log(`邀请奖励发放成功：邀请人 ${inviterOpenid}，被邀请人 ${openid}`)
  } catch (err) {
    console.error('处理邀请奖励失败', err)
    // 不抛出错误，避免影响主流程
  }
}