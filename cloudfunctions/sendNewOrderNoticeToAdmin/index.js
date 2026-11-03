const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 格式化日期为微信 date 类型要求的 "YYYY-MM-DD HH:MM:SS"
function formatDateTime(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// HTTPS GET 请求
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
  })
}

// HTTPS POST 请求
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    // 解析 URL
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

// 获取公众号 access_token（带缓存）
async function getOfficialAccountAccessToken(appId, appSecret) {
  const cacheCollection = db.collection('access_token_cache')
  const cacheRes = await cacheCollection.where({ appId }).get()

  const now = Date.now()
  if (cacheRes.data.length > 0) {
    const cache = cacheRes.data[0]
    // 提前 5 分钟过期
    if (cache.expireTime > now + 5 * 60 * 1000) {
      console.log(`使用缓存的 access_token，appId: ${appId}`)
      return cache.token
    }
  }

  // 重新获取
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
  console.log(`重新获取 access_token，appId: ${appId}`)
  const data = await httpsGet(url)

  if (!data.access_token) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`)
  }

  const token = data.access_token
  const expireTime = now + (data.expires_in || 7200) * 1000

  if (cacheRes.data.length > 0) {
    await cacheCollection.doc(cacheRes.data[0]._id).update({
      data: { token, expireTime, updateTime: db.serverDate() }
    })
  } else {
    await cacheCollection.add({
      data: { appId, token, expireTime, createTime: db.serverDate() }
    })
  }

  return token
}

// 发送公众号模板消息
async function sendOfficialAccountTemplateMessage({ openid, templateId, pagePath, data, accessToken, miniProgramAppId }) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`
  const body = {
    touser: openid,
    template_id: templateId,
    miniprogram: {
      appid: miniProgramAppId,
      pagepath: pagePath
    },
    data
  }
  const result = await httpsPost(url, body)
  if (result.errcode !== 0) {
    throw new Error(`发送失败: ${JSON.stringify(result)}`)
  }
  return result
}

// 构造公众号模板消息数据（根据常见的新订单通知模板字段）
function buildOfficialAccountTemplateData({ orderId, goodsNames, totalPrice, deliveryAddr, timeLabel, timeDisplay, remark }) {
  // 常用字段名：first, keyword1, keyword2, keyword3, remark
  // 如果你的模板字段不同，请修改这里
  return {
    first: { value: '您有新的订单，请及时处理', color: '#173177' },
    keyword1: { value: orderId, color: '#173177' },
    keyword2: { value: `¥${Number(totalPrice || 0).toFixed(2)}`, color: '#173177' },
    keyword3: { value: goodsNames || '无商品', color: '#173177' },
    keyword4: { value: deliveryAddr || '未填写', color: '#173177' },
    keyword5: { value: `${timeLabel}：${timeDisplay}`, color: '#173177' },
    remark: { value: remark ? `备注：${remark}` : '点击查看详情', color: '#999999' }
  }
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

// 构造商品文本：每个商品一行，显示名称 + 选择的标签 + 数量
function formatGoodsText(goodsList) {
  if (!Array.isArray(goodsList) || goodsList.length === 0) return '无商品'
  return goodsList.map((g, i) => {
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

// 构造企业微信消息内容
function buildQyWechatMessage({ goodsList, totalPrice, deliveryAddr, timeDisplay, remark }) {
  const price = Number(totalPrice || 0).toFixed(2)
  let text = `🛒 新订单通知\n\n`
  text += `💰 金额：¥${price}\n`
  text += `🍜 商品：\n${formatGoodsText(goodsList)}\n`
  text += `📍 地址：${deliveryAddr}\n`
  if (remark) {
    text += `📝 备注：${remark}\n`
  }
  text += `\n⏰ ${timeDisplay}`
  return text
}

exports.main = async (event) => {
  const { orderId, totalPrice, goodsList, remark, deliveryAddress, selectedTime, deliveryType } = event

  // 获取店铺配置
  const shopRes = await db.collection('shopinfo').limit(1).get()
  if (shopRes.data.length === 0) return { code: -1, message: '未找到店铺信息' }
  const shop = shopRes.data[0]
  const adminPush = shop.adminPushSettings || {}

  if (!adminPush.enableNewOrderMsg) {
    return { code: -1, message: '商家推送未开启' }
  }

  // 获取所有管理员
  const adminRes = await db.collection('admin').get()
  if (adminRes.data.length === 0) return { code: -1, message: '未找到管理员' }

  // 公共数据准备
  const goodsNames = goodsList.map(g => g.dishName || g.goodsName || '未知').join('、').slice(0, 20)
  let deliveryAddr = '未填写'
  if (deliveryAddress) {
    deliveryAddr = deliveryAddress.address || deliveryAddress.detail || deliveryAddress.locationName || '未填写'
  }
  const timeLabel = deliveryType === 'takeout' ? '配送' : '取餐'
  const timeDisplay = selectedTime && selectedTime !== '立即' ? selectedTime : '立即'
  const createTimeStr = formatDateTime(new Date())

  // 默认企业微信机器人 Webhook（⚠️ 替换成你自己的，或在管理后台"推送设置"里配置）
  const DEFAULT_QY_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_QY_WEBHOOK_KEY'

  // 企业微信群机器人推送：与 pay_success（微信支付回调）保持一致——
  // 只要推送开关已开启（上方已校验 enableNewOrderMsg）且有 webhook（后台配置或默认）即推送，
  // 不依赖 useQyWechat 字段，避免后台未勾选该开关时余额支付不推送
  const qyWechatWebhook = adminPush.qyWechatWebhook || DEFAULT_QY_WEBHOOK

  // ==================== 企业微信群机器人推送 ====================
  if (qyWechatWebhook) {
    const message = buildQyWechatMessage({
      goodsList,
      totalPrice,
      deliveryAddr,
      timeDisplay,
      remark
    })

    try {
      await sendQyWechatMessage(qyWechatWebhook, message)
      console.log('企业微信群机器人推送成功')
      // 标记已通知，与 pay_success 去重逻辑一致，防止极端情况重复推送
      if (orderId) {
        db.collection('order').doc(orderId).update({ data: { qyNotified: true } })
          .catch(err => console.error('标记 qyNotified 失败（不影响推送结果）:', err.message))
      }
      return { code: 0, message: '企业微信推送成功', type: 'qywechat' }
    } catch (err) {
      console.error('企业微信群机器人推送失败:', err.message)
      return { code: -1, message: `企业微信推送失败: ${err.message}`, type: 'qywechat' }
    }
  }

  // ==================== 公众号模板消息 ====================
  const useOfficialAccount = !!adminPush.useOfficialAccount
  if (useOfficialAccount) {
    if (!adminPush.oaAppId || !adminPush.oaAppSecret || !adminPush.oaTemplateId) {
      return { code: -1, message: '公众号配置不完整，请检查 AppID、AppSecret、模板ID' }
    }

    let accessToken
    try {
      accessToken = await getOfficialAccountAccessToken(adminPush.oaAppId, adminPush.oaAppSecret)
    } catch (err) {
      console.error('获取 access_token 失败', err)
      return { code: -1, message: `获取 access_token 失败: ${err.message}` }
    }

    // 获取小程序 AppID
    const wxContext = cloud.getWXContext()
    const miniProgramAppId = wxContext.APPID

    const templateData = buildOfficialAccountTemplateData({
      orderId,
      goodsNames,
      totalPrice,
      deliveryAddr,
      timeLabel,
      timeDisplay,
      remark
    })

    const mpOpenids = adminRes.data.map(a => a.mpOpenid).filter(Boolean)
    if (mpOpenids.length === 0) {
      return { code: -1, message: '未找到管理员的公众号 OpenID，请先绑定' }
    }

    console.log(`准备向 ${mpOpenids.length} 位管理员发送公众号模板消息`)

    const sendTasks = mpOpenids.map(async (mpOpenid) => {
      try {
        await sendOfficialAccountTemplateMessage({
          openid: mpOpenid,
          templateId: adminPush.oaTemplateId,
          pagePath: `pages/orderDetail/orderDetail?id=${orderId}`,
          data: templateData,
          accessToken,
          miniProgramAppId
        })
        console.log(`向 ${mpOpenid} 发送公众号消息成功`)
        return { openid: mpOpenid, success: true }
      } catch (err) {
        console.error(`向 ${mpOpenid} 发送公众号消息失败:`, err.message)
        return { openid: mpOpenid, success: false, error: err.message }
      }
    })

    const results = await Promise.all(sendTasks)
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length
    console.log(`公众号模板消息发送完成：成功 ${successCount}，失败 ${failCount}`)
    return { code: 0, successCount, failCount, results }
  }

  // ==================== 小程序订阅消息（原有逻辑） ====================
  if (!adminPush.newOrderMsgTemplateId) {
    return { code: -1, message: '未配置小程序订阅消息模板ID' }
  }

  let remarkStr = `${timeLabel}：${timeDisplay}`
  if (remark) remarkStr += ` | ${remark}`
  remarkStr = remarkStr.slice(0, 20)

  const templateData = {
    thing1: { value: (shop.name || '店铺').slice(0, 20) },
    thing2: { value: (goodsNames || '无商品').slice(0, 20) },
    thing3: { value: deliveryAddr.slice(0, 20) },
    date4: { value: createTimeStr },
    thing5: { value: remarkStr }
  }

  const adminOpenids = adminRes.data.map(a => a.openid).filter(Boolean)
  if (adminOpenids.length === 0) {
    return { code: -1, message: '未找到管理员openid' }
  }

  console.log(`准备向 ${adminOpenids.length} 位管理员发送小程序订阅消息`)

  const sendTasks = adminOpenids.map(async (adminOpenid) => {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: adminOpenid,
        page: `pages/orderDetail/orderDetail?id=${orderId}`,
        data: templateData,
        templateId: adminPush.newOrderMsgTemplateId,
        miniprogramState: 'formal'
      })
      return { openid: adminOpenid, success: true }
    } catch (err) {
      console.error(`向 ${adminOpenid} 发送失败 [${err.errCode}]:`, JSON.stringify(err))
      return { openid: adminOpenid, success: false, error: err.errMsg || err.message, errCode: err.errCode }
    }
  })

  const results = await Promise.all(sendTasks)
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  console.log(`小程序订阅消息发送完成：成功 ${successCount}，失败 ${failCount}`)
  return { code: 0, successCount, failCount, results }
}
