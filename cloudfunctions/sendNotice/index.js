const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 格式化日期
function formatDateTime(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

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
    text: { content }
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
  const goodsNames = goodsList.map(g => g.dishName).join('、').slice(0, 20)
  let deliveryAddr = '未填写'
  if (deliveryAddress) {
    deliveryAddr = deliveryAddress.address || deliveryAddress.detail || deliveryAddress.locationName || '未填写'
  }
  const timeLabel = deliveryType === 'takeout' ? '配送' : '取餐'
  const timeDisplay = selectedTime && selectedTime !== '立即' ? selectedTime : '立即'
  const createTimeStr = formatDateTime(new Date())

  // 默认企业微信机器人 Webhook（⚠️ 替换成你自己的，或在管理后台"推送设置"里配置）
  const DEFAULT_QY_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_QY_WEBHOOK_KEY'

  // 判断是否使用企业微信群机器人
  const qyWechatWebhook = adminPush.qyWechatWebhook || DEFAULT_QY_WEBHOOK
  const useQyWechat = adminPush.useQyWechat || (adminPush.qyWechatWebhook ? true : false)

  // ==================== 企业微信群机器人推送 ====================
  if (useQyWechat && qyWechatWebhook) {
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
      return { code: 0, message: '企业微信推送成功', type: 'qywechat' }
    } catch (err) {
      console.error('企业微信群机器人推送失败:', err.message)
      return { code: -1, message: `企业微信推送失败: ${err.message}`, type: 'qywechat' }
    }
  }

  // ==================== 小程序订阅消息（默认逻辑） ====================
  const templateData = {
    thing1: { value: (shop.name || '店铺').slice(0, 20) },
    thing2: { value: (goodsNames || '无商品').slice(0, 20) },
    thing3: { value: deliveryAddr.slice(0, 20) },
    date4: { value: createTimeStr },
    thing5: { value: `${timeLabel}：${timeDisplay}` }
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
