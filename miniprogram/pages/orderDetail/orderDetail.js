// pages/orderDetail/orderDetail.js
const app = getApp()
const db = wx.cloud.database()

// 优惠券来源文案映射（与后台订单管理保持一致）
function getCouponSourceText(source) {
  switch (source) {
    case 'invite_reward': return '邀请有奖'
    case 'new_user_gift': return '新用户赠礼'
    case 'seckill': return '限时秒杀'
    case 'lottery': return '幸运抽奖'
    case 'point_exchange': return '积分兑换'
    case 'admin_gift': return '管理员赠送'
    case 'ticket_package': return '优惠券中心'
    default: return source || ''
  }
}

Page({
  data: {
    order: null,
    themeColor: '#B8956E'
  },

  onLoad(options) {
    this.setThemeColor()
    const id = options.id || options.orderId
    if (!id) {
      wx.showToast({ title: '订单号不存在', icon: 'none' })
      return
    }
    this.loadOrderDetail(id)
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor: themeColor })
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadOrderDetail(id) {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await db.collection('order').doc(id).get()
      const order = res.data
      if (!order) throw new Error('订单不存在')
      if (order.goodsList) {
        order.goodsList = order.goodsList.map(item => ({
          ...item,
          subtotal: (Math.round(item.price * item.count * 100) / 100).toFixed(2)
        }))
      }
      let statusText = ''
      let statusColor = this.data.themeColor
      switch (order.status) {
        case 0:
        case 'pending': statusText = '待支付'; break
        case 1:
        case 'paid': statusText = '已支付'; break
        case 2:
        case 'completed': statusText = '已完成'; break
        case 3:
        case 'cancelled': statusText = '已取消'; statusColor = '#9E9E9E'; break
        case 4:
        case 'refunded': statusText = '已退款'; statusColor = '#FF6B6B'; break
        case 'refunding': statusText = '退款中'; statusColor = '#FFA500'; break
        default: statusText = '已完成'
      }
      const createTime = order.createTime ? new Date(order.createTime).toLocaleString() : ''
      // 计算优惠明细
      let goodsSubtotal = 0
      if (order.goodsList) {
        goodsSubtotal = order.goodsList.reduce((sum, item) => Math.round((sum + (item.price || 0) * (item.count || 1)) * 100) / 100, 0)
      }
      const deliveryFee = order.deliveryFee || 0
      // finalPrice 已含配送费，优惠 = 商品小计 + 配送费 - 实付
      const totalDiscount = Math.max(0, Math.round((goodsSubtotal + deliveryFee - (order.finalPrice || 0)) * 100) / 100)
      const totalDiscountText = totalDiscount > 0 ? totalDiscount.toFixed(2) : ''
      // 会员卡余额95折优惠
      const hasBalanceDiscount = (order.balanceDiscount && order.balanceDiscount > 0) || false
      const balanceDiscountText = hasBalanceDiscount ? order.balanceDiscount.toFixed(2) : ''
      // 查询订单使用的优惠券信息（商品券/满减券/折扣券）
      let couponInfo = null
      const couponId = order.usedCouponId
      let couponSource = order.couponSource || ''
      if (couponId || order.couponName) {
        // 优先使用下单时保存的优惠券快照
        let name = order.couponName || ''
        let couponType = order.couponType || ''
        if ((!name || !couponSource) && couponId) {
          // 历史订单无快照或来源缺失时，回退查询 user_coupons（走云函数，管理员查看他人订单时客户端直查会被权限拦截）
          try {
            const couponRes = await wx.cloud.callFunction({
              name: 'getCouponSources',
              data: { ids: [couponId] }
            })
            const list = (couponRes.result && couponRes.result.success && couponRes.result.data) || []
            const c = list[0]
            if (c) {
              name = c.name || ''
              couponType = c.type || ''
              // 旧订单未记录来源时，从优惠券记录反查
              if (!couponSource && c.source) couponSource = c.source
              if (c.type === 'product' && c.productId) {
                const goods = (order.goodsList || []).find(g => g.dishId === c.productId)
                if (goods) name = `${c.name}（${goods.dishName}）`
              }
            }
          } catch (couponErr) {
            console.error('查询订单优惠券信息失败', couponErr)
          }
        }
        if (name) {
          const typeText = couponType === 'product' ? '商品券' : (couponType === 'discount' ? '折扣券' : '满减券')
          couponInfo = { name, typeText, source: couponSource, sourceText: getCouponSourceText(couponSource) }
        }
      }
      this.setData({ order: { ...order, statusText, statusColor, createTime, totalDiscountText, goodsSubtotal, deliveryFee, hasBalanceDiscount, balanceDiscountText, couponInfo } })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 点击手机号直接拨打电话
  callPhone(e) {
    const phone = e.currentTarget.dataset.phone
    if (!phone) {
      wx.showToast({ title: '该订单无手机号', icon: 'none' })
      return
    }
    wx.makePhoneCall({
      phoneNumber: String(phone)
    })
  },

  copyUserInfo() {
    const { order } = this.data
    if (!order) return
    const parts = []
    if (order.userNickName) parts.push(`姓名：${order.userNickName}`)
    if (order.userPhone) parts.push(`手机：${order.userPhone}`)
    if (order.shippingAddress) {
      const addr = order.shippingAddress
      const addrStr = [addr.locationName, addr.address, addr.detail].filter(Boolean).join(' ')
      if (addrStr) parts.push(`地址：${addrStr}`)
    }
    if (!parts.length) {
      wx.showToast({ title: '无可复制信息', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: parts.join('\n'),
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      }
    })
  },

  onShareAppMessage() {
    const o = this.data.order
    if (o && o.goodsList && o.goodsList.length) {
      const statusText = (typeof o.status === 'string') ? o.status : ({0:'待支付',1:'已支付',2:'已完成',3:'已取消',4:'已退款'})[o.status] || '已下单'
      return require('../../utils/share.js').shareMessage({
        type: 'order',
        title: '订单详情 · ' + (o.shopName || getApp().globalData.shopName || '美食在线'),
        path: '/pages/orderDetail/orderDetail',
        order: {
          orderNo: o.orderNo || o._id,
          statusText,
          total: o.actualPrice || o.totalPrice || '',
          dishes: (o.goodsList || []).slice(0, 3).map(g => ({ name: g.name, image: g.image, price: g.price }))
        }
      })
    }
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '订单详情', path: '/pages/orderDetail/orderDetail' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '订单详情' })
  }
})