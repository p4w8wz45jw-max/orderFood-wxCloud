// utils/shareCard.js
// 用 Canvas 2D 绘制统一的品牌分享卡片（1285x964，符合微信转发大图规范）。
// 绘制后缓存到本地文件系统，分享时直接复用本地路径，避免使用页面截图。
//
// 支持三类海报（type）：
//   - 'brand'    : 默认品牌卡（店名 + 主营品类/标签 + 二维码 + 底部信息）
//   - 'goods'    : 菜品卡（菜品大图 + 菜品名 + 价格/折扣 + 店名）
//   - 'order'    : 订单卡（订单号 + 订单状态 + 菜品缩略图 + 合计）
//
// 色彩取自 app.globalData.themeColor（暖棕 #B8956E），整套卡片保持品牌一致性。

const CARD_W = 1285
const CARD_H = 964
const PRIMARY = '#B8956E'
const PRIMARY_DARK = '#8A6B4A'
const PRIMARY_LIGHT = '#FFF6E9'
const ACCENT = '#D66036'
const INK = '#3C2819'
const INK_SOFT = '#6E5846'

// 当前正在绘制的画布引用（用于 canvasToTempFilePath）
let _drawingCanvas = null
let _drawingCtx = null
let _drawingDpr = 1

// 缓存键（每页一种）
const cacheKey = (opts) => `shareCard_${opts && opts.type ? opts.type : 'brand'}_${(opts && opts.cacheKey) || 'default'}`

async function getShareCardPath(opts) {
  try {
    const k = cacheKey(opts)
    const cached = wx.getStorageSync(k)
    if (cached) {
      try {
        await wx.getFileSystemManager().accessSync(cached)
        return cached
      } catch (_) { /* 文件失效，重画 */ }
    }
    const p = await drawAndSave(opts, k)
    return p
  } catch (e) {
    console.warn('[shareCard] getShareCardPath failed', e)
    return ''
  }
}

function drawAndSave(opts, cacheK) {
  return new Promise((resolve) => {
    const query = wx.createSelectorQuery()
    query.select('#__share_card_canvas__')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.warn('[shareCard] canvas 节点未找到')
          return resolve('')
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio || 1
        canvas.width = CARD_W * dpr
        canvas.height = CARD_H * dpr
        ctx.scale(dpr, dpr)
        _drawingCanvas = canvas
        _drawingCtx = ctx
        _drawingDpr = dpr

        const type = (opts && opts.type) || 'brand'
        const pendingImgs = []
        if (type === 'goods') pendingImgs.push(...drawGoodsCard(ctx, opts))
        else if (type === 'order') pendingImgs.push(...drawOrderCard(ctx, opts))
        else drawBrandCard(ctx, opts)

        const afterDraw = () => {
          wx.canvasToTempFilePath({
            canvas,
            x: 0, y: 0, width: CARD_W, height: CARD_H,
            destWidth: CARD_W, destHeight: CARD_H,
            fileType: 'png',
            success: (r) => {
              try {
                const fs = wx.getFileSystemManager()
                const target = `${wx.env.USER_DATA_PATH}/${cacheK}.png`
                if (typeof fs.saveFileSync === 'function') {
                  try { fs.removeSavedFileSync && fs.removeSavedFileSync(target) } catch (_) {}
                  fs.saveFileSync(r.tempFilePath, target)
                  wx.setStorageSync(cacheK, target)
                  resolve(target)
                  return
                }
              } catch (_) {}
              wx.setStorageSync(cacheK, r.tempFilePath)
              resolve(r.tempFilePath)
            },
            fail: (e) => {
              console.warn('[shareCard] canvasToTempFilePath fail', e)
              resolve('')
            }
          })
        }

        if (pendingImgs.length === 0) {
          afterDraw()
        } else {
          Promise.all(pendingImgs).then(afterDraw, afterDraw)
        }
      })
  })
}

/* ====================== 品牌海报（默认） ====================== */
function drawBrandCard(ctx, opts) {
  const shopName = (opts && opts.shopName) || '美食在线'
  const slogan = (opts && opts.slogan) || '新鲜现做'  // 不再使用"30分钟达"
  const tags = (opts && opts.tags) || ['堂食', '外卖', '会员折扣']

  // 1. 渐变背景
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H)
  grad.addColorStop(0, PRIMARY_LIGHT)
  grad.addColorStop(1, '#F3E0C6')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 2. 左上大圆 + 右下小圆
  ctx.fillStyle = PRIMARY
  ctx.beginPath(); ctx.arc(180, 180, 360, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = PRIMARY_DARK
  ctx.beginPath(); ctx.arc(CARD_W - 80, CARD_H + 40, 280, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = PRIMARY_DARK
  ctx.fillRect(0, 0, CARD_W, 12)

  // 3. 餐盘 logo
  ctx.save()
  ctx.translate(180, 180)
  ctx.fillStyle = PRIMARY_LIGHT
  ctx.beginPath(); ctx.arc(0, 0, 130, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath(); ctx.arc(-35, -45, 70, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = ACCENT
  ctx.beginPath(); ctx.arc(40, -30, 18, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = PRIMARY_DARK
  ctx.beginPath(); ctx.arc(-30, 40, 14, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = ACCENT
  ctx.beginPath(); ctx.arc(50, 50, 10, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // 筷子
  ctx.fillStyle = PRIMARY_DARK
  ctx.fillRect(280, 60, 14, 230)
  ctx.fillRect(304, 60, 14, 230)

  // 4. 主标题（店名）
  ctx.fillStyle = INK
  ctx.font = 'bold 116px sans-serif'
  ctx.textBaseline = 'top'
  fitText(ctx, shopName, 1100)
  ctx.fillText(shopName, 80, 410)

  // 5. 副标题（slogan）
  ctx.fillStyle = INK_SOFT
  ctx.font = '54px sans-serif'
  ctx.fillText(slogan, 80, 555)

  // 6. 标签徽章
  let bx = 80, by = 660
  ctx.font = 'bold 44px sans-serif'
  ctx.textBaseline = 'middle'
  for (const b of tags) {
    const tw = ctx.measureText(b).width
    const bw = tw + 60
    roundRect(ctx, bx, by, bw, 76, 38)
    ctx.fillStyle = ACCENT
    ctx.fill()
    ctx.fillStyle = PRIMARY_LIGHT
    ctx.fillText(b, bx + 30, by + 38)
    bx += bw + 18
  }

  drawFooter(ctx, opts)
}

/* ====================== 菜品海报 ====================== */
function drawGoodsCard(ctx, opts) {
  const shopName = (opts && opts.shopName) || '美食在线'
  const dishName = (opts && opts.dishName) || '招牌推荐'
  const price = (opts && opts.price) || ''
  const originPrice = (opts && opts.originPrice) || ''
  const discountText = (opts && opts.discountText) || '' // 例 "9折"
  const imageUrl = (opts && opts.imageUrl) || ''         // 菜品图（云存储 fileID 或 https）
  const tags = (opts && opts.tags) || ['热销', '现做']
  const pending = []

  // 背景：渐变 + 顶部品类色条
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H)
  grad.addColorStop(0, '#FFFDF8')
  grad.addColorStop(1, '#F3E0C6')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = PRIMARY_DARK
  ctx.fillRect(0, 0, CARD_W, 12)

  // 大菜品图圆角矩形（占上半部分）
  const imgX = 80, imgY = 60, imgW = CARD_W - 160, imgH = 540
  roundRect(ctx, imgX, imgY, imgW, imgH, 32)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = PRIMARY_LIGHT
  ctx.fillRect(imgX, imgY, imgW, imgH)
  if (imageUrl) {
    pending.push(new Promise((resolve) => {
      try {
        const img = _drawingCanvas.createImage()
        const draw = () => {
          const ratio = Math.max(imgW / img.width, imgH / img.height)
          const dw = img.width * ratio
          const dh = img.height * ratio
          const dx = imgX + (imgW - dw) / 2
          const dy = imgY + (imgH - dh) / 2
          _drawingCtx.drawImage(img, dx, dy, dw, dh)
          resolve()
        }
        img.onload = draw
        img.onerror = () => resolve()
        img.src = imageUrl
        // 部分基础库 onload 可能已触发
        if (img.complete) draw()
        // 兜底超时 3 秒
        setTimeout(resolve, 3000)
      } catch (_) { resolve() }
    }))
  } else {
    // 没有图时画一个"餐盘"装饰
    ctx.fillStyle = PRIMARY
    ctx.beginPath()
    ctx.arc(imgX + imgW / 2, imgY + imgH / 2, 160, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PRIMARY_LIGHT
    ctx.beginPath()
    ctx.arc(imgX + imgW / 2, imgY + imgH / 2, 110, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ACCENT
    ctx.beginPath()
    ctx.arc(imgX + imgW / 2 + 30, imgY + imgH / 2 - 20, 22, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 菜品名（大字）
  ctx.fillStyle = INK
  ctx.font = 'bold 96px sans-serif'
  ctx.textBaseline = 'top'
  fitText(ctx, dishName, 1100)
  ctx.fillText(dishName, 80, 640)

  // 价格 + 原价 + 折扣徽章（同一行）
  let px = 80, py = 770
  if (price) {
    ctx.fillStyle = ACCENT
    ctx.font = 'bold 88px sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText('¥' + price, px, py)
    px += ctx.measureText('¥' + price).width + 24
    if (originPrice) {
      ctx.fillStyle = INK_SOFT
      ctx.font = '36px sans-serif'
      const opText = '原价 ¥' + originPrice
      ctx.fillText(opText, px, py + 36)
      // 删除线
      const tw = ctx.measureText(opText).width
      ctx.fillStyle = INK_SOFT
      ctx.fillRect(px, py + 56, tw, 4)
      px += tw + 24
    }
  }
  if (discountText) {
    ctx.font = 'bold 40px sans-serif'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(discountText).width
    const bw = tw + 50
    roundRect(ctx, px, py + 8, bw, 68, 34)
    ctx.fillStyle = ACCENT
    ctx.fill()
    ctx.fillStyle = PRIMARY_LIGHT
    ctx.fillText(discountText, px + 25, py + 42)
  }

  // 标签徽章（贴在菜名下）
  let bx = 80, by = 870
  ctx.font = 'bold 36px sans-serif'
  ctx.textBaseline = 'middle'
  for (const b of tags.slice(0, 3)) {
    const tw = ctx.measureText(b).width
    const bw = tw + 50
    roundRect(ctx, bx, by, bw, 56, 28)
    ctx.fillStyle = PRIMARY
    ctx.fill()
    ctx.fillStyle = PRIMARY_LIGHT
    ctx.fillText(b, bx + 25, by + 28)
    bx += bw + 14
  }

  drawFooter(ctx, opts, shopName)
  return pending
}

/* ====================== 订单海报 ====================== */
function drawOrderCard(ctx, opts) {
  const shopName = (opts && opts.shopName) || '美食在线'
  const orderNo = (opts && opts.orderNo) || ''
  const statusText = (opts && opts.statusText) || '已下单'
  const total = (opts && opts.total) || ''
  const dishes = (opts && opts.dishes) || [] // [{name, image, price}]
  const pending = []

  // 背景
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H)
  grad.addColorStop(0, '#FFFDF8')
  grad.addColorStop(1, '#F3E0C6')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = PRIMARY_DARK
  ctx.fillRect(0, 0, CARD_W, 12)

  // 顶部标题
  ctx.fillStyle = INK
  ctx.font = 'bold 76px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(shopName, 80, 60)
  ctx.fillStyle = INK_SOFT
  ctx.font = '32px sans-serif'
  ctx.fillText(orderNo ? '订单号：' + orderNo : '订单详情', 80, 160)

  // 状态徽章
  ctx.font = 'bold 40px sans-serif'
  ctx.textBaseline = 'middle'
  const stw = ctx.measureText(statusText).width
  roundRect(ctx, CARD_W - 80 - stw - 50, 60, stw + 50, 70, 35)
  ctx.fillStyle = ACCENT
  ctx.fill()
  ctx.fillStyle = PRIMARY_LIGHT
  ctx.fillText(statusText, CARD_W - 80 - stw - 25, 95)

  // 菜品缩略图列表
  let dy = 230
  for (const d of dishes.slice(0, 3)) {
    // 缩略图
    roundRect(ctx, 80, dy, 140, 140, 16)
    ctx.save()
    ctx.clip()
    ctx.fillStyle = PRIMARY_LIGHT
    ctx.fillRect(80, dy, 140, 140)
    if (d.image) {
      pending.push(new Promise((resolve) => {
        try {
          const img = _drawingCanvas.createImage()
          const draw = () => {
            const ratio = Math.max(140 / img.width, 140 / img.height)
            const dw = img.width * ratio, dh = img.height * ratio
            _drawingCtx.drawImage(img, 80 + (140 - dw) / 2, dy + (140 - dh) / 2, dw, dh)
            resolve()
          }
          img.onload = draw
          img.onerror = () => resolve()
          img.src = d.image
          if (img.complete) draw()
          setTimeout(resolve, 3000)
        } catch (_) { resolve() }
      }))
    }
    ctx.restore()
    // 名称
    ctx.fillStyle = INK
    ctx.font = '40px sans-serif'
    ctx.textBaseline = 'top'
    fitText(ctx, d.name || '', 800)
    ctx.fillText(d.name || '', 250, dy + 24)
    // 价格
    if (d.price) {
      ctx.fillStyle = ACCENT
      ctx.font = 'bold 44px sans-serif'
      ctx.fillText('¥' + d.price, 250, dy + 76)
    }
    dy += 170
  }

  // 合计
  if (total) {
    ctx.fillStyle = INK_SOFT
    ctx.font = '36px sans-serif'
    ctx.fillText('合计', 80, 760)
    ctx.fillStyle = ACCENT
    ctx.font = 'bold 70px sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText('¥' + total, 80, 800)
  }

  drawFooter(ctx, opts, shopName)
  return pending
}

/* ====================== 底部信息条 ====================== */
function drawFooter(ctx, opts, shopName) {
  ctx.fillStyle = PRIMARY_LIGHT
  ctx.fillRect(0, CARD_H - 200, CARD_W, 200)
  ctx.fillStyle = PRIMARY_DARK
  ctx.fillRect(0, CARD_H - 200, CARD_W, 8)

  // 二维码占位
  const qrSize = 140
  const qrX = 82, qrY = CARD_H - 168
  roundRect(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 12)
  ctx.fillStyle = PRIMARY_LIGHT
  ctx.fill()
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 8)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.fillStyle = PRIMARY_LIGHT
  const cell = qrSize / 9
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if ((i * 7 + j * 3) % 5 < 2) {
        ctx.fillRect(qrX + i * cell, qrY + j * cell, cell - 1, cell - 1)
      }
    }
  }

  // 底部文案（不再有"30分钟达"）
  ctx.textBaseline = 'top'
  ctx.fillStyle = INK
  ctx.font = 'bold 42px sans-serif'
  ctx.fillText('长按识别 · 立即点餐', 260, CARD_H - 154)
  ctx.fillStyle = INK_SOFT
  ctx.font = '32px sans-serif'
  const tag1 = (opts && opts.footerLine1) || '新人首单立减  ·  会员充值送豪礼'
  const tag2 = (opts && opts.footerLine2) || '每天 10:00 - 22:00 在线服务'
  ctx.fillText(tag1, 260, CARD_H - 96)
  ctx.fillText(tag2, 260, CARD_H - 56)
}

/* ====================== 工具函数 ====================== */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// 文字过长时按比例缩字号（保留可读性），最大宽度 maxW
function fitText(ctx, text, maxW) {
  let size = parseInt(ctx.font.match(/(\d+)px/)[1], 10)
  while (ctx.measureText(text).width > maxW && size > 24) {
    size -= 2
    ctx.font = ctx.font.replace(/\d+px/, size + 'px')
  }
}

module.exports = { getShareCardPath, CARD_W, CARD_H }