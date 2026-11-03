
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({
  throwOnNotFound: false
})
const _ = db.command

// 默认企业微信机器人 Webhook（⚠️ 替换成你自己的，或在管理后台"推送设置"里配置）
const DEFAULT_QY_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_QY_WEBHOOK_KEY'

// HTTPS POST 请求
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const match = url.match(/^https?:\/\/([^/]+)(\/.*)$/)
    if (!match) {
      reject(new Error(`无效的 URL: ${url}`))
      return
    }
    const hostname = match[1]
    const path = match[2]

    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(JSON.stringify(body), 'utf8')
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`解析响应失败: ${data}`))
        }
      })
    }).on('error', reject)

    req.write(JSON.stringify(body))
    req.end()
  })
}

// 发送企业微信群机器人消息
async function sendQyWechatMessage(webhook, content) {
  // 使用 text 类型：兼容微信个人端 / 外部微信群。
  // markdown 在微信个人端会显示"暂不支持此消息类型"，且 <bold> 不是标准 markdown 标签。
  const body = {
    msgtype: 'text',
    text: {
      content
    }
  }
  return httpsPost(webhook, body)
}

// 发送企业微信通知（异步，不阻塞主流程）
async function sendOrderNoticeToQyWechat(orderId) {
  try {
    // 查询订单数据
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) {
      console.log('企业微信通知：订单不存在', orderId)
      return
    }
    const orderData = orderRes.data

    // 非点餐订单不通知
    if (orderData.type !== 'order') {
      console.log('企业微信通知：非点餐订单，跳过')
      return
    }

    // 只推送最近5分钟内的订单，防止部署/回调延迟推送历史订单
    const orderCreateTime = orderData.createTime
      ? (typeof orderData.createTime === 'object' && orderData.createTime.getTime
          ? new Date(orderData.createTime.getTime())
          : new Date(orderData.createTime))
      : new Date(0)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    if (orderCreateTime.getTime() < fiveMinutesAgo) {
      console.log('企业微信通知：订单超过5分钟，跳过（防止推送历史订单）')
      return
    }

    // 去重：已经发过通知就不再发（防止微信回调重试导致重复推送）
    if (orderData.qyNotified) {
      console.log('企业微信通知：该订单已通知过，跳过')
      return
    }

    // 获取店铺配置
    const shopRes = await db.collection('shopinfo').limit(1).get()
    const shop = shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : null
    const adminPush = shop?.adminPushSettings || {}

    // 检查是否开启了新订单推送
    if (!adminPush.enableNewOrderMsg) {
      console.log('企业微信通知：新订单推送未开启，跳过')
      return
    }

    const webhook = adminPush.qyWechatWebhook || DEFAULT_QY_WEBHOOK
    const totalPrice = (orderData.finalPrice || orderData.totalPrice || 0).toFixed(2)

    // 商品文本（兼容 goodsList / goods，每个商品一行：名称 + 选择的标签 + 数量）
    let goodsText = '无商品'
    const rawGoods = (orderData.goodsList && orderData.goodsList.length > 0)
      ? orderData.goodsList
      : (orderData.goods || [])
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

    // 地址
    let address = '无'
    if (orderData.orderType === 'takeout' && orderData.shippingAddress) {
      address = typeof orderData.shippingAddress === 'string'
        ? orderData.shippingAddress
        : (orderData.shippingAddress.address || orderData.shippingAddress.detail || '无')
    }

    // 时间
    const timeDisplay = orderData.selectedTime && orderData.selectedTime !== '立即' ? orderData.selectedTime : '立即'

    // 备注
    const remark = orderData.remark || '无'

    const message = `🛒 新订单通知

💰 金额：¥${totalPrice}
🍜 商品：
${goodsText}
📍 地址：${address}
📝 备注：${remark}
⏰ ${timeDisplay}`

    console.log('企业微信群推送内容:', message)
    await sendQyWechatMessage(webhook, message)
    console.log('企业微信群推送成功')

    // 标记已通知，防止回调重试时重复发送
    await db.collection('order').doc(orderId).update({
      data: { qyNotified: true }
    })
    console.log('企业微信通知：已标记 qyNotified=true')
  } catch (err) {
    console.error('企业微信群推送失败:', err.message)
  }
}

// 生成打印内容 - 精简模板
function generateSimpleContent(order, shopInfo) {
  const shopName = shopInfo?.name || '餐饮店'
  
  let content = ''
  content += '<C></C><BR>'
  content += '<C></C><BR>'
  
  // 第一行：大字店名
  content += `<C><font# bolder=1 height=4 width=4>${escapeHtml(shopName)}</font#></C><BR>`
  content += '<BR>'
  
  // 第二行：商品名字
  if (order.goods && order.goods.length > 0) {
    order.goods.forEach(item => {
      const dishName = escapeHtml(item.dishName || item.goodsName || '未知菜品')
      const count = item.count || 1
      const price = parseFloat(item.price || 0).toFixed(2)
      const rightPart = `×${count}  ￥${price}`
      const dishNameWidth = getStringWidth(dishName)
      const rightPartWidth = getStringWidth(rightPart)
      const totalWidth = 31
      const spacesNeeded = totalWidth - dishNameWidth - rightPartWidth
      const spaces = spacesNeeded > 0 ? generateSpaces(spacesNeeded) : ' '
      content += `<LEFT><font# bolder=0 height=2 width=1>${dishName}${spaces}${rightPart}</font#></LEFT><BR>`
    })
  }
  content += '<BR>'
  
  // 第三行：取餐/配送时间
  const timeLabel = order.orderType === 'takeout' ? '配送时间' : '取餐时间'
  const timeValue = order.selectedTime || ''
  content += `<LEFT>${timeLabel}: ${escapeHtml(timeValue)}</LEFT><BR>`
  
  // 配送地址（外卖订单才显示）
  if (order.orderType === 'takeout' && order.shippingAddress) {
    const addr = typeof order.shippingAddress === 'string' 
      ? order.shippingAddress 
      : (order.shippingAddress.address || order.shippingAddress.detail || '')
    if (addr) {
      content += `<LEFT>配送地址: ${escapeHtml(addr)}</LEFT><BR>`
    }
  }
  content += '<BR>'
  
  // 第四行：价格
  const finalPrice = (order.finalPrice || 0).toFixed(2)
  content += `<RIGHT><font# bolder=0 height=2 width=1>实付  ￥${finalPrice}</font#></RIGHT><BR>`
  
  content += '<C></C><BR>'
  content += '<C></C><BR>'
  return content
}

// 生成打印内容 - 默认模板
function generatePrintContent(order, shopInfo) {
  const orderTypeText = order.orderType === 'dineIn' ? '堂食' : '打包'
  
  // 处理时间：如果 createTime 是服务器时间对象，需要特殊处理
  let date = new Date()
  if (order.createTime) {
    if (order.createTime instanceof Date) {
      date = order.createTime
    } else if (typeof order.createTime === 'object' && order.createTime.getTime) {
      date = new Date(order.createTime.getTime())
    } else {
      date = new Date(order.createTime)
    }
  }
  
  const formatDate = (d) => {
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000)
    const pad = (n) => (n < 10 ? '0' + n : n)
    // 使用UTC方法获取转换后的时间
    return `${beijingTime.getUTCFullYear()}-${pad(beijingTime.getUTCMonth() + 1)}-${pad(beijingTime.getUTCDate())} ${pad(beijingTime.getUTCHours())}:${pad(beijingTime.getUTCMinutes())}`
  }
  
  // 计算字符串的显示宽度（中文字符占2个宽度，英文数字占1个宽度）
  const getStringWidth = (str) => {
    if (!str) return 0
    let width = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i)
      // 判断是否为中文字符（包括中文标点）
      if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) {
        width += 2
      } else {
        width += 1
      }
    }
    return width
  }
  
  // 生成指定宽度的空格字符串
  const generateSpaces = (count) => {
    return ' '.repeat(count)
  }
  
  // 转义HTML特殊字符
  const escapeHtml = (str) => {
    if (!str) return ''
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  
  // 隐藏电话号码中间4位
  const hidePhoneNumber = (phone) => {
    if (!phone) return ''
    const phoneStr = String(phone)
    // 如果是11位手机号，隐藏中间4位（第4-7位）
    if (phoneStr.length === 11) {
      return phoneStr.substring(0, 3) + '****' + phoneStr.substring(7)
    }
    // 如果不是11位，返回原值
    return phoneStr
  }
  let content = `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C><font# bolder=1 height=2 width=2>${orderTypeText}订单</font#></C><BR>`
  content += `<C><font# bolder=1 height=2 width=2>${escapeHtml(shopInfo?.name || '餐饮店')}</font#></C><BR>`
  content += `<BR>`
  
  // 订单编号和时间
  content += `<C>********************************</C><BR>`
  content += `<LEFT>订单编号: ${escapeHtml(order._id)}</LEFT><BR>`
  content += `<LEFT>下单时间: ${formatDate(date)}</LEFT><BR>`
  
  // 桌码号（如果有）
  if (order.tableNumber) {
    content += `<C><font# bolder=1 height=2 width=2>桌码: ${escapeHtml(order.tableNumber)}</font#></C><BR>`
  }
  
  content += `<C>--------------商品--------------</C><BR>`
  
  // 商品列表
  if (order.goods && order.goods.length > 0) {
    order.goods.forEach(item => {
      const dishName = escapeHtml(item.dishName || item.goodsName || '未知菜品')
      const count = item.count || 1
      // 确保价格格式正确，避免小数点0换行
      const price = parseFloat(item.price || 0).toFixed(2)
      // 格式化商品行：商品名称 + 空格填充 + 数量 × 价格
      // 总宽度32个字符，自动计算空格数（减少1个空格避免价格最后一个0换行）
      const rightPart = `×${count}  ￥${price}`
      const dishNameWidth = getStringWidth(dishName)
      const rightPartWidth = getStringWidth(rightPart)
      const totalWidth = 31 // 总宽度31个字符（减少1个避免换行）
      const spacesNeeded = totalWidth - dishNameWidth - rightPartWidth
      const spaces = spacesNeeded > 0 ? generateSpaces(spacesNeeded) : ' '
      content += `<LEFT><font# bolder=0 height=2 width=1>${dishName}${spaces}${rightPart}</font#></LEFT><BR>`
      
      // 打印标签（如果有）
      if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        const tagsText = item.tags.map(tag => escapeHtml(tag)).join(' ')
        content += `<LEFT><font# bolder=0 height=2 width=1>  ${tagsText}</font#></LEFT><BR>`
      }
    })
  }
  
  // 价格信息
  const finalPrice = (order.finalPrice || 0).toFixed(2)
  
  // 添加分隔线隔开菜品
  content += `<C>--------------------------------</C><BR>`
  
  // if (order.useMiandan) {
  //   const originalPrice = (order.totalPrice || 0).toFixed(2)
  //   content += `<LEFT>免单优惠                  ￥${originalPrice}</LEFT><BR>`
  // }
  
  // 实付价格，居右显示
  content += `<RIGHT><font# bolder=0 height=2 width=1>实付  ￥${finalPrice}</font#></RIGHT><BR>`
  
  // 显示支付方式
  let payMethodText = ''
  if (order.useMiandan) {
    payMethodText = '免单支付'
  } else if (order.pay_status) {
    // 如果已支付，可能是余额支付或微信支付
    // 从pay_success回调来的订单，都是微信支付成功的
    payMethodText = '微信支付'
  } else {
    payMethodText = '余额支付'
  }
  if (payMethodText) {
    content += `<LEFT>支付方式: ${payMethodText}</LEFT><BR>`
  }
  
  content += `<C>--------------------------------</C><BR>`
  if (order.userPhone) {
    const hiddenPhone = hidePhoneNumber(order.userPhone)
    content += `<LEFT><font# bolder=1 height=1 width=1>客户电话: ${escapeHtml(hiddenPhone)}</font#></LEFT><BR>`
  }
  // 配送地址
  if (order.orderType === 'takeout' && order.shippingAddress) {
    const addr = typeof order.shippingAddress === 'string' 
      ? order.shippingAddress 
      : (order.shippingAddress.address || order.shippingAddress.detail || '')
    if (addr) {
      content += `<LEFT>配送地址: ${escapeHtml(addr)}</LEFT><BR>`
    }
  }
  
  content += `<C>**************<font# bolder=1 height=2 width=1>完</font#><font# bolder=0 height=1 width=1>**************</font#></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  content += `<C></C><BR>`
  return content
}

// 异步打印订单（不阻塞主流程）
async function printOrderAsync(orderId, orderData) {
  try {
    // 如果未传入 orderData，自己查询
    if (!orderData) {
      const orderRes = await db.collection('order').doc(orderId).get()
      if (!orderRes.data) return
      orderData = orderRes.data
    }
    if (orderData.type !== 'order') return
    // 1. 查询打印机信息
    const printerRes = await db.collection('printer').limit(1).get()
    if (!printerRes.data || printerRes.data.length === 0) {
      console.log('未绑定打印机，跳过打印')
      return
    }
    
    const printer = printerRes.data[0]
    
    // 2. 查询店铺信息
    const shopRes = await db.collection('shopinfo').limit(1).get()
    const shopInfo = shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : null
    
    // 3. 生成打印内容（根据模板选择）
    const printTemplate = shopInfo?.printTemplate || 'default'
    const printContent = printTemplate === 'simple'
      ? generateSimpleContent(orderData, shopInfo)
      : generatePrintContent(orderData, shopInfo)
    
    // 4. 调用打印接口
    // 根据订单类型设置播报音源：16-堂食订单，19-打包订单
    const voice = orderData.orderType === 'dineIn' ? '16' : '19'
    
    const printRes = await cloud.callFunction({
      name: 'printManage',
      data: {
        $url: 'printNote',
        sn: printer.sn,
        voice: voice,
        voicePlayTimes: 1,
        voicePlayInterval: 3,
        content: printContent,
        copies: 1,
        expiresInSeconds: 7200, // 2小时
        outTradeNo: orderId
      }
    })
    
    if (printRes.result && printRes.result.success) {
      console.log('打印订单成功', printRes.result)
    } else {
      console.error('打印订单失败', printRes.result)
    }
  } catch (err) {
    console.error('打印订单异常', err)
    // 不抛出异常，避免影响支付回调
  }
}



// 云函数入口函数
exports.main = async (event, context) => {
  const orderId = event.outTradeNo
  const returnCode = event.returnCode

  // 非支付成功回调（如验证通知），直接返回成功，不触发重试
  if (returnCode !== 'SUCCESS') {
    console.log(`pay_success 收到非支付回调，returnCode=${returnCode}，直接返回成功避免重试`)
    return { errcode: 0, errmsg: 'ok' }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      // 1. 查询订单
      const orderRes = await transaction.collection('order').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        await transaction.rollback('订单不存在')
      }

      // 2. 更新订单支付状态（保护已退款/取消的订单不被回调覆盖）
      if (order.status === 'refunded' || order.status === 4 ||
          order.status === 'cancelled' || order.status === 3 ||
          order.status === 'refunding' || order.refundTime) {
        console.log(`订单 ${orderId} 已退款/取消，跳过状态更新`)
        return { success: true, skipStatusUpdate: true }
      }
      await transaction.collection('order').doc(orderId).update({
        data: {
          payStatus: true,
          status: 'paid',
          payTime: db.serverDate()
        }
      })

      // 3. 如果是点餐订单，稍后在事务外异步打印

      // 4. 如果是充值订单，处理余额和免单
      if (order.type === 'recharge') {
        const openid = order._openid
        const totalGet = order.totalGet || (order.amount + order.giveAmount)

        // 3.1 增加用户余额
        const userRes = await transaction.collection('user').where({
          _openid: openid
        }).get()

        if (userRes.data && userRes.data.length > 0) {
          const user = userRes.data[0]
          const currentBalance = user.balance || 0
          // 四舍五入到分，防止浮点累计误差（如 21.5 + 1.55 = 23.0500000000004）
          const newBalance = Math.round((currentBalance + totalGet) * 100) / 100
          await transaction.collection('user').doc(user._id).update({
            data: {
              balance: newBalance
            }
          })
        }

        // 3.2 计算是否首次充值（只保留“首次充值免单一次”的规则）
        const paidRechargeCount = await transaction.collection('order').where({
          _openid: openid,
          type: 'recharge',
          pay_status: true
        }).count()

        let addFreeCount = 0

        // 首次充值赠送 1 次免单
        if (paidRechargeCount.total === 1 && order.amount >68) {
          addFreeCount = 1
        }

        // 3.3 如需赠送免单次数，则更新/创建 freeBuy 记录
        if (addFreeCount > 0) {
          const freeBuyRes = await transaction.collection('freeBuy').where({
            _openid: openid
          }).get()

          if (freeBuyRes.data && freeBuyRes.data.length > 0) {
            await transaction.collection('freeBuy').doc(freeBuyRes.data[0]._id).update({
              data: {
                count: _.inc(addFreeCount)
              }
            })
          } else {
            await transaction.collection('freeBuy').add({
              data: {
                _openid: openid,
                count: addFreeCount
              }
            })
          }
        }
      }

      return {
        success: true
      }
    })

    if (result.success) {
      // 微信支付订单发放积分（1元=1积分，余额支付不积分）
      if (!result.skipStatusUpdate) {
        addPointsForOrder(orderId).catch(err => {
          console.error('发放积分失败（不影响支付流程）', err)
        })
        // 标记订单使用的优惠券为已使用（微信支付成功场景）
        markCouponUsedForOrder(orderId).catch(err => {
          console.error('标记优惠券已使用失败（不影响支付流程）', err)
        })
      }
      // 处理邀请奖励（微信支付成功后异步处理）
      processInviteRewardForPaySuccess(orderId).catch(err => {
        console.error('处理邀请奖励失败（pay_success）', err)
      })
      // 异步记录充值余额变动日志
      recordRechargeLog(orderId).catch(err => {
        console.error('记录充值日志失败', err)
      })
      // 异步发放充值积分（1元=1积分）
      addPointsForRecharge(orderId).catch(err => {
        console.error('发放充值积分失败（不影响支付流程）', err)
      })
      // 异步打印订单
      if (!result.skipStatusUpdate) {
        printOrderAsync(orderId).catch(err => {
          console.error('打印订单失败（不影响支付流程）', err)
        })
        // 异步发送企业微信群通知
        sendOrderNoticeToQyWechat(orderId).catch(err => {
          console.error('企业微信通知失败（不影响支付流程）', err)
        })
      }
      // 需要返回该字段，否则云支付会一直回调
      return { errcode: 0, errmsg: '支付成功' }
    }

    return { errcode: 1, errmsg: '事务执行失败' }
  } catch (e) {
    console.error('支付结果事务处理失败', e)
    return {
      errcode: 1,
      errmsg: '服务器异常'
    }
  }
}

// 处理微信支付成功后的邀请奖励
async function processInviteRewardForPaySuccess(orderId) {
  try {
    // 查询订单获取邀请人信息
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) return
    const order = orderRes.data
    const openid = order._openid
    const inviterOpenid = order.inviterOpenid

    if (!inviterOpenid || inviterOpenid === openid) return
    if (inviterOpenid === 'undefined' || inviterOpenid === 'null' || inviterOpenid === '') return

    // 检查邀请奖励配置是否开启
    const configRes = await db.collection('config').doc('invite_reward').get()
    if (!configRes.data || !configRes.data.inviteEnabled) return

    const rewardCouponId = configRes.data.rewardCouponId
    if (!rewardCouponId) return

    // 检查用户是否为新用户（此前没有其他支付成功的订单）
    const orderCount = await db.collection('order')
      .where({ _openid: openid, pay_status: true })
      .count()
    if (orderCount.total > 1) {
      console.log('用户不是新用户（pay_success），已有多笔已支付订单')
      return
    }

    // 检查是否已经发放过邀请奖励
    const existingRecord = await db.collection('invite_records')
      .where({ invitedOpenid: openid, status: 'success' })
      .get()
    if (existingRecord.data && existingRecord.data.length > 0) return

    // 获取优惠券模板
    const couponTemplate = await db.collection('coupon').doc(rewardCouponId).get()
    if (!couponTemplate.data) return
    const coupon = couponTemplate.data

    const expireTime = new Date()
    expireTime.setDate(expireTime.getDate() + (coupon.expireDays || 30))

    // 发放优惠券
    await db.collection('user_coupons').add({
      data: {
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
    })

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

    console.log(`邀请奖励发放成功（pay_success）：邀请人 ${inviterOpenid}，被邀请人 ${openid}`)
  } catch (err) {
    console.error('处理邀请奖励失败（pay_success）', err)
  }
}

// 记录充值余额变动日志（仅记录一次，幂等保护）
async function recordRechargeLog(orderId) {
  try {
    // 检查是否已记录过
    const existRes = await db.collection('balance_log')
      .where({ orderId: orderId, type: 'recharge' })
      .get()
    if (existRes.data && existRes.data.length > 0) {
      return // 已记录，跳过
    }

    // 查询订单获取金额
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) return
    const order = orderRes.data
    if (order.type !== 'recharge') return

    const totalGet = order.totalGet || (order.amount + (order.giveAmount || 0))
    await db.collection('balance_log').add({
      data: {
        _openid: order._openid,
        type: 'recharge',
        amount: totalGet,
        description: `在线充值 +¥${totalGet.toFixed(2)}${order.giveAmount ? `（含赠¥${order.giveAmount}）` : ''}`,
        orderId: orderId,
        createTime: db.serverDate()
      }
    })
  } catch (err) {
    console.error('recordRechargeLog 失败', err)
  }
}

// 充值赠送积分（1元=1积分，基于充值金额不含赠送部分）
async function addPointsForRecharge(orderId) {
  try {
    const existRes = await db.collection('points_log')
      .where({ orderId: orderId, type: 'earn' })
      .get()
    if (existRes.data && existRes.data.length > 0) {
      console.log(`充值订单 ${orderId} 已发放过积分，跳过`)
      return
    }

    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) return
    const order = orderRes.data
    if (order.type !== 'recharge') return

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
  } catch (err) {
    console.error('addPointsForRecharge 失败', err)
  }
}

// 微信支付成功后，将订单使用的优惠券标记为已使用（幂等：重复设置 used:true 无害）
async function markCouponUsedForOrder(orderId) {
  try {
    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) return
    const order = orderRes.data

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

    const orderRes = await db.collection('order').doc(orderId).get()
    if (!orderRes.data) return
    const order = orderRes.data
    if (order.type === 'recharge') return  // 充值订单不积分

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
