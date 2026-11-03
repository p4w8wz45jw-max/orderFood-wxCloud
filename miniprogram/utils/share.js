// utils/share.js
// 提供统一的 onShareAppMessage / onShareTimeline 返回值生成器。
// 支持三类海报：'brand'(品牌) / 'goods'(菜品) / 'order'(订单)
//
// 用法 1（异步生成图片）：
//   onShareAppMessage() {
//     return require('../../utils/share.js').shareMessage({
//       type: 'goods',
//       title: '...',
//       path: '/pages/index/index',
//       goods: { name, image, price, originPrice, discountText }
//     })
//   }
//
// 用法 2（默认品牌卡）：
//   onShareAppMessage() { return require('../../utils/share.js').defaultShareAppMessage() }

const app = getApp()
const { getShareCardPath } = require('./shareCard.js')

// 同步返回基础字段，imageUrl 在后台异步替换；微信客户端在用户点击"转发"时
// 短时间窗口内会读取 onShareAppMessage 的返回值，异步图路径如果尚未就绪，
// 这里先返回空串让微信走默认截图（首次绘制完成后下次分享即生效）。
function shareMessage(opts) {
  opts = opts || {}
  const app2 = getApp()
  const type = opts.type || 'brand'
  const title = opts.title || defaultTitle()
  const path = opts.path || '/pages/index/index'

  const cacheK = buildCacheKey(type, opts)
  let cached = ''
  try { cached = wx.getStorageSync(cacheK) || '' } catch (_) {}

  // 异步触发实际绘制（如果缓存已存在则跳过）
  const cardOpts = buildCardOpts(type, opts)
  cardOpts.cacheKey = cacheK
  if (!cached) {
    setTimeout(() => { getShareCardPath(cardOpts) }, 0)
  }

  return {
    title,
    path,
    imageUrl: cached,
    // 兼容字段
  }
}

function shareTimelineMessage(opts) {
  const m = shareMessage(opts)
  return {
    title: m.title,
    query: '',
    imageUrl: m.imageUrl
  }
}

function defaultShareAppMessage() {
  return shareMessage({ type: 'brand' })
}

function defaultShareTimeline() {
  return shareTimelineMessage({ type: 'brand' })
}

function defaultTitle() {
  const a = getApp()
  return a.globalData.shopName ? `${a.globalData.shopName} · 新鲜现做` : '美食在线 · 新鲜现做'
}

// 根据 type 拼缓存键，让不同菜品/订单互不冲突
function buildCacheKey(type, opts) {
  if (type === 'goods') {
    const g = opts.goods || {}
    return `shareCard_goods_${g.id || g.dishId || 'x'}_${g._t || ''}`
  }
  if (type === 'order') {
    const o = opts.order || {}
    return `shareCard_order_${o.orderNo || o.id || 'x'}`
  }
  return 'shareCard_brand_default'
}

function buildCardOpts(type, opts) {
  const app2 = getApp()
  const base = {
    shopName: opts.shopName || app2.globalData.shopName || '美食在线',
    slogan: opts.slogan || '新鲜现做',
    footerLine1: opts.footerLine1 || '新人首单立减  ·  会员充值送豪礼',
    footerLine2: opts.footerLine2 || '每天 10:00 - 22:00 在线服务'
  }
  if (type === 'goods') {
    const g = opts.goods || {}
    return Object.assign({}, base, {
      type: 'goods',
      dishName: g.name || opts.title || '招牌推荐',
      price: g.price || '',
      originPrice: g.originPrice || '',
      discountText: g.discountText || '',
      imageUrl: g.image || '',
      tags: g.tags || ['热销', '现做']
    })
  }
  if (type === 'order') {
    const o = opts.order || {}
    return Object.assign({}, base, {
      type: 'order',
      orderNo: o.orderNo || '',
      statusText: o.statusText || '已下单',
      total: o.total || '',
      dishes: o.dishes || []
    })
  }
  return Object.assign({}, base, { type: 'brand', tags: opts.tags || ['堂食', '外卖', '会员折扣'] })
}

module.exports = {
  shareMessage,
  shareTimelineMessage,
  defaultShareAppMessage,
  defaultShareTimeline,
  buildCardOpts,
  buildCacheKey
}