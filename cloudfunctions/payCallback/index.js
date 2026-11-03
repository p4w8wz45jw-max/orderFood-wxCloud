// cloudfunctions/payCallback/index.js
const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 默认企业微信机器人 Webhook（⚠️ 替换成你自己的，或在管理后台"推送设置"里配置）
const DEFAULT_QY_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_QY_WEBHOOK_KEY'

// HTTPS POST 请求
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const match = url.match(/^https?:\/\/([^/]+)(\/.*)$/)
    if (!match) { reject(new Error(`无效的 URL: ${url}`)); return }
    const hostname = match[1]
    const path = match[2]
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { resolve(data) })
    }).on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

exports.main = async (event, context) => {
  // 腾讯云 cloudPay 回调数据在 event.orderInfo 中
  const callbackData = event.orderInfo || event
  const outTradeNo = callbackData.outTradeNo || event.outTradeNo
  console.log('payCallback 收到回调，outTradeNo:', outTradeNo, '原始 event:', JSON.stringify(event).slice(0, 200))
  if (!outTradeNo) return { code: 1, message: 'no outTradeNo' }
  try {
    // 根据 outTradeNo 找到订单并更新支付状态
    // 关键修复：仅当订单未退款/取消时才更新，防止微信回调延迟覆盖退款状态
    const res = await db.collection('order').where({
      outTradeNo: outTradeNo,
      status: _.nin(['refunded', 'cancelled', 'refunding', 3, 4]),
      refundTime: _.exists(false)
    }).update({
      data: { payStatus: true, status: 'paid' }
    })
    if (res.stats.updated === 0) {
      // 检查是否是已被退款的订单（被保护性滤掉了）
      const checkRes = await db.collection('order').where({ outTradeNo: outTradeNo }).get()
      if (checkRes.data.length > 0) {
        console.log(`订单 ${outTradeNo} 已被退款，跳过支付回调状态更新`)
        return { code: 0, message: 'order already refunded, skip' }
      }
      // 如果没有找到，尝试直接用 outTradeNo 作为 _id（兼容旧订单）
      const checkRes2 = await db.collection('order').where({
        _id: outTradeNo,
        status: _.nin(['refunded', 'cancelled', 'refunding', 3, 4]),
        refundTime: _.exists(false)
      }).update({
        data: { payStatus: true, status: 'paid' }
      })
      if (checkRes2.stats.updated === 0) {
        console.log(`订单 ${outTradeNo} 已退款（_id方式），跳过`)
      }
    }

    // 异步发放积分（微信支付部分，1元=1积分，余额支付不积分）
    addPointsForOrder(outTradeNo).catch(err => {
      console.error('发放积分失败（不影响支付流程）', err)
    })

    // 异步打印订单（点餐订单）
    printOrderInCallback(outTradeNo).catch(err => {
      console.error('打印订单失败（不影响支付流程）', err)
    })

    // 异步发送企业微信群通知（带去重保护，防止微信回调重试重复推送）
    sendQyWechatNotice(outTradeNo).catch(err => {
      console.error('企业微信通知失败（不影响支付流程）', err)
    })

    // 异步标记订单使用的优惠券为已使用（微信支付成功场景）
    // doBuy 中仅纯余额支付时标记，微信支付部分必须在此回调中标记
    markCouponUsedForOrder(outTradeNo).catch(err => {
      console.error('标记优惠券已使用失败（不影响支付流程）', err)
    })

    return { code: 0, message: 'success' }
  } catch (err) {
    console.error('回调失败', err)
    return { code: 1, message: err.message }
  }
}

// 微信支付成功后发放积分（仅微信支付部分，1元=1积分，向下取整）
// 余额支付不积分
async function addPointsForOrder(orderId) {
  try {
    // 检查是否已发放过（幂等保护：已有 earn 记录则跳过）
    const existRes = await db.collection('points_log')
      .where({ orderId: orderId, type: 'earn' })
      .get()
    if (existRes.data && existRes.data.length > 0) {
      console.log(`订单 ${orderId} 已发放过积分，跳过`)
      return
    }

    // 先用 outTradeNo 查，再用 _id 查（兼容两种订单号格式）
    let orderRes = await db.collection('order').where({ outTradeNo: orderId }).get()
    if (!orderRes.data || orderRes.data.length === 0) {
      orderRes = await db.collection('order').doc(orderId).get()
    }
    if (!orderRes.data) return
    const order = Array.isArray(orderRes.data) ? orderRes.data[0] : orderRes.data

    // 关键保护：已退款/取消的订单不发放积分（防止回调延迟导致积分恢复）
    if (order.status === 'refunded' || order.status === 'cancelled' || order.status === 'refunding' ||
        order.status === 3 || order.status === 4 || order.refundTime) {
      console.log(`订单 ${orderId} 已退款/取消，跳过积分发放`)
      return
    }
    // 充值订单给积分（1元=1积分，基于充值金额不含赠送部分）
    if (order.type === 'recharge') {
      const amount = order.amount || 0
      const earnedPoints = Math.floor(amount)
      if (earnedPoints <= 0) return

      const userRes = await db.collection('user').where({ _openid: order._openid }).get()
      if (userRes.data && userRes.data.length > 0) {
        await db.collection('user').doc(userRes.data[0]._id).update({
          data: { points: db.command.inc(earnedPoints) }
        })
      }

      await db.collection('points_log').add({
        data: {
          _openid: order._openid,
          type: 'earn',
          amount: earnedPoints,
          description: '会员充值',
          orderId: orderId,
          createTime: db.serverDate()
        }
      })
      console.log(`充值订单 ${orderId}：充值 ¥${amount}，发放 ${earnedPoints} 积分`)
      return
    }

    const wechatPaid = order.wechatPaid || 0
    if (wechatPaid <= 0) {
      console.log(`订单 ${orderId} 无微信支付金额，不积分`)
      return
    }

    // 1元=1积分，向下取整
    const earnedPoints = Math.floor(wechatPaid)
    if (earnedPoints <= 0) return

    // 给用户增加积分
    const userRes = await db.collection('user').where({ _openid: order._openid }).get()
    if (userRes.data && userRes.data.length > 0) {
      await db.collection('user').doc(userRes.data[0]._id).update({
        data: {
          points: db.command.inc(earnedPoints)
        }
      })
    }

    // 记录积分日志
    await db.collection('points_log').add({
      data: {
        _openid: order._openid,
        type: 'earn',
        amount: earnedPoints,
        description: `微信支付消费¥${wechatPaid.toFixed(2)}，获得${earnedPoints}积分`,
        orderId: orderId,
        createTime: db.serverDate()
      }
    })

    console.log(`订单 ${orderId}：微信支付 ¥${wechatPaid}，发放 ${earnedPoints} 积分`)
  } catch (err) {
    console.error('addPointsForOrder 失败', err)
  }
}

// 发送企业微信群通知（带去重，防止回调重试重复推送）
async function sendQyWechatNotice(orderId) {
  try {
    // 先根据 outTradeNo 查找订单
    let orderRes = await db.collection('order').where({ outTradeNo: orderId }).get()
    if (!orderRes.data || orderRes.data.length === 0) {
      orderRes = await db.collection('order').doc(orderId).get()
    }
    if (!orderRes.data) return
    const order = Array.isArray(orderRes.data) ? orderRes.data[0] : orderRes.data

    // 非点餐订单不通知
    if (order.type && order.type !== 'order') return

    // 只推送最近5分钟内的订单，防止部署/回调延迟推送历史订单
    const orderCreateTime = order.createTime
      ? (typeof order.createTime === 'object' && order.createTime.getTime
          ? new Date(order.createTime.getTime())
          : new Date(order.createTime))
      : new Date(0)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    if (orderCreateTime.getTime() < fiveMinutesAgo) {
      console.log('企业微信通知：订单超过5分钟，跳过（防止推送历史订单）')
      return
    }

    // 去重：已经发过通知就不再发
    if (order.qyNotified) {
      console.log('企业微信通知：该订单已通知过，跳过')
      return
    }

    // 获取店铺配置
    const shopRes = await db.collection('shopinfo').limit(1).get()
    const shop = shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : null
    const adminPush = shop?.adminPushSettings || {}
    const webhook = adminPush.qyWechatWebhook || DEFAULT_QY_WEBHOOK
    const orderIdDoc = order._id || orderId
    const totalPrice = (order.finalPrice || order.totalPrice || 0).toFixed(2)

    // 商品文本（兼容 goodsList / goods，每个商品一行：名称 + 选择的标签 + 数量）
    let goodsText = '无商品'
    const rawGoods = (order.goodsList && order.goodsList.length > 0)
      ? order.goodsList
      : (order.goods || [])
    if (rawGoods.length > 0) {
      goodsText = rawGoods.map((g, i) => {
        const name = g.dishName || g.goodsName || '未知'
        const count = g.count || 1
        const tags = []
        if (Array.isArray(g.tags)) {
          g.tags.filter(Boolean).forEach(t => tags.push(t))
        } else if (g.tags && typeof g.tags === 'object') {
          Object.keys(g.tags).forEach(tagId => {
            const value = g.tags[tagId]
            if (Array.isArray(value)) value.filter(Boolean).forEach(v => tags.push(v))
            else if (value) tags.push(value)
          })
        }
        const tagText = tags.length > 0 ? `（${tags.join('、')}）` : ''
        return `${i + 1}. ${name}${tagText}×${count}`
      }).join('\n')
    }

    let address = '无'
    if (order.orderType === 'takeout' && order.shippingAddress) {
      address = typeof order.shippingAddress === 'string'
        ? order.shippingAddress
        : (order.shippingAddress.address || order.shippingAddress.detail || '无')
    }

    const timeDisplay = order.selectedTime && order.selectedTime !== '立即' ? order.selectedTime : '立即'
    const remark = order.remark || '无'

    const message = `🛒 新订单通知

💰 金额：¥${totalPrice}
🍜 商品：
${goodsText}
📍 地址：${address}
📝 备注：${remark}
⏰ ${timeDisplay}`

    // 使用 text 类型：兼容微信个人端 / 外部微信群。
    // markdown 在微信个人端会显示"暂不支持此消息类型"，且 <bold> 不是标准 markdown 标签。
    await httpsPost(webhook, { msgtype: 'text', text: { content: message } })
    console.log('企业微信群推送成功')

    // 标记已通知，防止回调重试时重复发送
    await db.collection('order').doc(orderIdDoc).update({
      data: { qyNotified: true }
    })
    console.log('企业微信通知：已标记 qyNotified=true')
  } catch (err) {
    console.error('企业微信群推送失败:', err.message)
  }
}

// 微信支付成功后，将订单使用的优惠券标记为已使用（幂等：重复设置 used:true 无害）
async function markCouponUsedForOrder(orderId) {
  try {
    // 先用 outTradeNo 查，再用 _id 查（兼容两种订单号格式）
    let orderRes = await db.collection('order').where({ outTradeNo: orderId }).get()
    if (!orderRes.data || orderRes.data.length === 0) {
      orderRes = await db.collection('order').doc(orderId).get()
    }
    if (!orderRes.data) return
    const order = Array.isArray(orderRes.data) ? orderRes.data[0] : orderRes.data

    // 充值订单无优惠券
    const couponId = order.usedCouponId
    if (!couponId) return

    // 已退款/取消的订单不标记优惠券
    if (order.status === 'refunded' || order.status === 'cancelled' || order.status === 'refunding' ||
        order.status === 3 || order.status === 4 || order.refundTime) {
      console.log(`订单 ${orderId} 已退款/取消，跳过优惠券标记`)
      return
    }

    await db.collection('user_coupons').doc(couponId).update({
      data: { used: true, usedTime: db.serverDate() }
    })
    console.log(`订单 ${orderId} 使用的优惠券 ${couponId} 已标记为已使用`)
  } catch (err) {
    // 优惠券文档可能已被管理员删除，忽略该错误
    console.error('markCouponUsedForOrder 失败', err.message)
  }
}

// 支付回调时打印订单
async function printOrderInCallback(outTradeNo) {
  try {
    // 先根据 outTradeNo 查找订单
    let orderRes = await db.collection('order').where({ outTradeNo }).get()
    if (!orderRes.data || orderRes.data.length === 0) {
      orderRes = await db.collection('order').doc(outTradeNo).get()
    }
    if (!orderRes.data) return
    const order = Array.isArray(orderRes.data) ? orderRes.data[0] : orderRes.data
    
    // 只打印点餐订单（没有type字段的订单也允许打印）
    if (order.type && order.type !== 'order') return
    // 防止重复打印
    if (order.printId || order.printStatus) {
      console.log(`订单 ${order._id} 已打印过，跳过`)
      return
    }

    // 查询打印机
    const printerRes = await db.collection('printer').limit(1).get()
    if (!printerRes.data || printerRes.data.length === 0) return

    const sn = printerRes.data[0].sn
    const shopRes = await db.collection('shopinfo').limit(1).get()
    const shopName = shopRes.data[0]?.name || '餐饮店'
    const printTemplate = shopRes.data[0]?.printTemplate || 'default'

    // 生成打印内容（使用 HTML 标签格式）
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
    await cloud.callFunction({
      name: 'printManage',
      data: {
        $url: 'printNote',
        sn, voice, voicePlayTimes: 1, voicePlayInterval: 3,
        content, copies: 1, expiresInSeconds: 7200, outTradeNo: order._id
      }
    })
    console.log(`订单 ${order._id} 打印成功`)
  } catch (err) {
    console.error('printOrderInCallback 失败', err)
  }
}