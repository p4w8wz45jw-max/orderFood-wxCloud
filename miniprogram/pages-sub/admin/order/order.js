// pages-sub/admin/order/order.js
const db = wx.cloud.database()
const app = getApp()

function getStatusText(status) {
  switch (status) {
    case 0:
    case 'pending': return '待支付'
    case 1:
    case 'paid': return '已支付'
    case 2:
    case 'completed': return '已完成'
    case 3:
    case 'cancelled': return '已取消'
    case 4:
    case 'refunded': return '已退款'
    case 'refunding': return '退款中'
    default: return '已完成'
  }
}

// 优惠券来源文案映射
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

// 兼容历史订单中存储优惠券 ID 的各种字段名
function getOrderCouponId(order) {
  const fields = ['usedCouponId', 'couponId', 'coupon_id', 'usedCoupon', 'coupon']
  for (const field of fields) {
    const val = order[field]
    if (val) {
      if (typeof val === 'string') return val
      if (typeof val === 'object' && val._id && typeof val._id === 'string') return val._id
    }
  }
  return null
}

Page({
  data: {
    orders: [],
    loading: false,
    refundingId: ''       // 正在退款的订单 _id，防止重复点击
  },

  onLoad() {
    this.setThemeColor()
    this.loadOrders()
  },

  onShow() {
    this.setThemeColor()
    // 首屏数据已由 onLoad 加载，onShow 只在从其他页面返回时静默刷新，避免重复请求卡顿
    if (this._hasLoaded) {
      this.loadOrders()
    }
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    console.log('订单管理页面设置主题色:', themeColor)
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadOrders() {
    if (this.data.loading) return
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })
    try {
      // 30天前的时间戳（仍保留客户端过滤兜底，兼容旧版 getAllData）
      const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000

      const formatTime = (time) => {
        if (!time) return ''
        const date = time instanceof Date ? time : new Date(time)
        if (isNaN(date.getTime())) return ''
        const pad = (n) => (n < 10 ? '0' + n : n)
        const y = date.getFullYear()
        const m = pad(date.getMonth() + 1)
        const d = pad(date.getDate())
        const hh = pad(date.getHours())
        const mm = pad(date.getMinutes())
        return `${y}-${m}-${d} ${hh}:${mm}`
      }

      const toTs = (time) => {
        if (!time) return 0
        return time instanceof Date ? time.getTime() : (new Date(time)).getTime()
      }

      // 1. 加载普通订单（服务端按最近30天+已支付筛选，大幅减少传输数据；客户端过滤兜底）
      const orderRes = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'order', recentDays: 30, onlyPaid: true }
      })
      let orderList = []
      if (orderRes.result && orderRes.result.success && orderRes.result.data) {
        orderList = orderRes.result.data.filter(order => {
          const ts = toTs(order.createTime)
          return ts >= thirtyDaysAgo
        })
      }

      // 2. 加载秒杀订单
      let seckillList = []
      try {
        const seckillRes = await wx.cloud.callFunction({
          name: 'getAllData',
          data: { collection: 'seckill_order', recentDays: 30, onlyPaid: true }
        })
        if (seckillRes.result && seckillRes.result.success && seckillRes.result.data) {
          seckillList = seckillRes.result.data.filter(order => {
            const payTime = order.payTime || order.createTime
            const ts = toTs(payTime)
            return ts >= thirtyDaysAgo && order.status === 'paid'
          })
        }
      } catch (seckillErr) {
        console.log('加载秒杀订单失败（集合可能不存在）', seckillErr)
      }

      // 3. 格式化普通订单
      const paidOrders = orderList.filter(order =>
        order.payStatus || order.pay_status || order.status === 'paid'
      )
      // 旧订单未记录优惠券来源时，批量从 user_coupons 反查（用于展示来源）
      const needSourceIds = paidOrders
        .filter(o => o.couponName && !o.couponSource && getOrderCouponId(o))
        .map(o => getOrderCouponId(o))
        .filter((v, i, a) => a.indexOf(v) === i)
      let couponSourceMap = {}
      if (needSourceIds.length > 0) {
        try {
          // 走云函数查询：客户端直查 user_coupons 受权限限制（管理员查不到他人优惠券），云函数可跨用户读取
          const couponRes = await wx.cloud.callFunction({
            name: 'getCouponSources',
            data: { ids: needSourceIds }
          })
          const list = (couponRes.result && couponRes.result.success && couponRes.result.data) || []
          list.forEach(c => {
            if (c.source) couponSourceMap[c._id] = c.source
          })
        } catch (err) {
          console.error('补查优惠券来源失败', err)
        }
      }
      const formattedOrders = paidOrders.map(order => {
        const payEffective = order.payStatus || order.pay_status || order.status === 'paid'
        const isRefunded = order.status === 'refunded' || order.status === 'cancelled' || order.status === 'refunding'
          || order.status === 4 || order.status === 3 || !!order.refundTime || !!order.refundResult
        const canRefund = payEffective && !isRefunded && order.type !== 'recharge' && !order.useMiandan
        const couponSource = order.couponSource || couponSourceMap[getOrderCouponId(order)]
        const couponSourceText = order.couponName
          ? getCouponSourceText(couponSource)
          : ''
        return {
          ...order,
          _source: 'order',
          createTimeText: formatTime(order.createTime),
          orderTypeText: order.orderType === 'takeout' ? '外卖' : (order.orderType === 'dineIn' ? '堂食' : '自取'),
          statusText: getStatusText(order.status),
          canRefund,
          couponSourceText
        }
      })

      // 4. 格式化秒杀订单
      const formattedSeckillOrders = seckillList.map(order => ({
        _id: order._id,
        _openid: order._openid,
        _source: 'seckill',
        type: 'seckill',
        title: order.title || '',
        price: order.price || 0,
        finalPrice: order.price || 0,
        wechatPaid: order.price || 0,
        balancePaid: 0,
        payStatus: true,
        pay_status: true,
        status: 'paid',
        statusText: '秒杀',
        createTime: order.payTime || order.createTime,
        createTimeText: formatTime(order.payTime || order.createTime),
        orderTypeText: '秒杀',
        goodsList: [{
          dishId: order.seckillId,
          dishName: order.couponName || order.title || '秒杀商品',
          price: order.price || 0,
          count: 1
        }],
        couponName: order.couponName,
        couponSourceText: '限时秒杀',
        seckillTitle: order.title,
        canRefund: false,
        userAvatar: '',
        userNickName: '',
        userPhone: ''
      }))

      // 5. 合并并按时间倒序排列
      const allOrders = [...formattedOrders, ...formattedSeckillOrders]
      allOrders.sort((a, b) => toTs(b.createTime) - toTs(a.createTime))

      this.setData({ orders: allOrders })
    } catch (err) {
      console.error('加载订单失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
      this._hasLoaded = true
    }
  },

  // 一次性补全历史订单的优惠券来源（调用云函数回填写回 order 集合，永久修复）
  async backfillCouponSource() {
    wx.showLoading({ title: '补全中...' })
    try {
      const res = await wx.cloud.callFunction({ name: 'backfillCouponSource', data: {} })
      const result = res.result || {}
      wx.hideLoading()
      if (result.success) {
        wx.showModal({
          title: '补全完成',
          content: (() => {
            const stats = result.fieldStats || {}
            const samples = (result.failedSamples || []).map(s =>
              `${s.field || '无字段'}=${s.idValue || '空'}(${s.idType || 'unknown'})[模板ID:${s.isTemplateId ? '是' : '否'}]`
            ).join('\n')
            return `共 ${result.totalOrders || 0} 单，需补全 ${result.needOrders || 0} 单，已写入来源 ${result.updated || 0} 单。\n无券ID：${result.ordersWithoutCouponId || 0}，券无来源：${result.noSourceCount != null ? result.noSourceCount : (result.couponsWithoutSource || 0)}\n(direct:${result.directIdsFound || 0}/${result.directIdsQueried || 0}, template:${result.templateIdsMatched || 0}/${result.templateIdsQueried || 0}, 按名称:${result.nameMatched || 0})\n字段统计：usedCouponId=${stats.usedCouponId || 0}, couponId=${stats.couponId || 0}, coupon_id=${stats.coupon_id || 0}, usedCoupon=${stats.usedCoupon || 0}, coupon=${stats.coupon || 0}${samples ? '\n失败样例：\n' + samples : ''}`
          })(),
          showCancel: false,
          success: () => this.loadOrders()
        })
      } else {
        wx.showToast({ title: result.error || '补全失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('补全优惠券来源失败', err)
      wx.showModal({
        title: '补全失败',
        content: err.errMsg || err.message || '请确认已部署 backfillCouponSource 云函数',
        showCancel: false
      })
    }
  },

  goOrderDetail(e) {
    const order = e.currentTarget.dataset.order
    if (!order) return
    wx.navigateTo({
      url: `/pages/orderDetail/orderDetail?id=${order._id}`
    })
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

  // 退款操作
  refundOrder(e) {
    const order = e.currentTarget.dataset.order
    const index = e.currentTarget.dataset.index

    if (!order) return

    // 防重复点击
    if (this.data.refundingId) {
      return
    }

    // 二次确认：如果 canRefund 为 false 则拒绝
    const currentOrder = this.data.orders[index]
    if (currentOrder && !currentOrder.canRefund) {
      wx.showToast({ title: '该订单已退款', icon: 'none' })
      return
    }

    const payMethod = order.useMiandan ? '免单' :
      (order.wechatPaid > 0 && order.balancePaid > 0 ? '余额+微信' :
        (order.wechatPaid > 0 ? '微信支付' : '余额支付'))

    const totalPaid = (order.balancePaid || 0) + (order.wechatPaid || 0)

    wx.showModal({
      title: '确认退款',
      content: `订单号：${order._id}\n支付方式：${payMethod}\n退款金额：¥${totalPaid.toFixed(2)}\n\n余额支付部分将退回余额\n微信支付部分将原路退回`,
      confirmText: '确认退款',
      confirmColor: '#E54D42',
      success: async (res) => {
        if (res.confirm) {
          await this.doRefund(order, index)
        }
      }
    })
  },

  async doRefund(order, index) {
    this.setData({ refundingId: order._id })
    wx.showLoading({ title: '退款处理中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminRefund',
        data: { orderId: order._id }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        wx.showToast({ title: '退款成功', icon: 'success', duration: 2000 })

        // 更新本地订单列表状态
        const orders = this.data.orders
        orders[index] = {
          ...orders[index],
          status: 'refunded',
          canRefund: false,
          refundTime: new Date().toISOString(),
          refundResult: res.result.message
        }
        this.setData({ orders, refundingId: '' })
      } else {
        this.setData({ refundingId: '' })
        wx.showModal({
          title: '退款失败',
          content: res.result?.error || '退款处理失败，请重试',
          showCancel: false
        })
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ refundingId: '' })
      console.error('退款失败', err)
      wx.showModal({
        title: '退款异常',
        content: err.errMsg || err.message || '网络错误，请重试',
        showCancel: false
      })
    }
  },

  async reprint(e) {
    const order = e.currentTarget.dataset.order
    if (!order) return
    wx.showLoading({ title: '打印中...' })
    try {
      const printerRes = await db.collection('printer').limit(1).get()
      if (!printerRes.data.length) {
        wx.showToast({ title: '未绑定打印机', icon: 'none' })
        return
      }
      const sn = printerRes.data[0].sn
      const shopRes = await db.collection('shopinfo').limit(1).get()
      const shopName = shopRes.data[0]?.name || '餐饮店'
      const printTemplate = shopRes.data[0]?.printTemplate || 'default'
      const content = this.generatePrintContent(order, shopName, printTemplate)
      const printRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'printNote',
          sn: sn,
          content: content,
          copies: 1
        }
      })
      if (printRes.result && printRes.result.success) {
        wx.showToast({ title: '打印成功', icon: 'success' })
      } else {
        wx.showToast({ title: printRes.result?.error || '打印失败', icon: 'none' })
      }
    } catch (err) {
      console.error('打印失败', err)
      wx.showToast({ title: '打印失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  generatePrintContent(order, shopName, printTemplate = 'default') {
    if (printTemplate === 'simple') {
      // 精简模板：大字店名、商品名、取餐/配送时间、价格（HTML 格式）
      let content = '<C></C><BR>'
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
      return content
    }
    
    // 默认模板：完整信息
    const date = new Date(order.createTime)
    let content = '<C><font# bolder=1 height=2 width=2>' + shopName + '</font#></C><BR>'
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
      + '<C>欢迎下次光临</C><BR>'
    return content
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ title: '订单详情 - 餐饮点餐', path: '/pages/order/order' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ title: '订单详情 - 餐饮点餐' })
  }
})
