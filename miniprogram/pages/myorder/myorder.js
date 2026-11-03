// pages/myorder/myorder.js
const app = getApp()
const db = wx.cloud.database()

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

function getStatusClass(status) {
  switch (status) {
    case 'cancelled':
    case 3: return 'status-cancelled'
    case 'refunded':
    case 4: return 'status-refunded'
    case 'refunding': return 'status-refunding'
    default: return ''
  }
}

Page({
  data: {
    tabs: ['全部', '点餐订单', '充值订单'],
    currentTab: 0,
    orderList: [],
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false,
    userInfo: null,
    themeColor: '#B8956E'
  },

  onLoad() {
    this.setThemeColor()
    this.loadOrders()
  },

  onShow() {
    this.setThemeColor()
    this.loadUserInfo()
    this.loadOrders()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor: themeColor })
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadUserInfo() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({ _openid: openid }).get()
      if (res.data.length) {
        const user = res.data[0]
        if (typeof user.balance === 'undefined') {
          await db.collection('user').doc(user._id).update({ data: { balance: 0 } })
          user.balance = 0
        }
        this.setData({ userInfo: user })
      }
    } catch (err) { console.error(err) }
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentTab: index,
      orderPage: 0,
      orderHasMore: true,
      orderList: []
    })
    this.loadOrders()
  },

  async loadOrders(append = false) {
    if (this.data.loadingOrders) return
    if (!append) wx.showLoading({ title: '加载中...' })
    try {
      this.setData({ loadingOrders: true })
      const openid = app.globalData.openid
      const _ = db.command
      // 简化为基础查询，避免 _.and + _.or 嵌套在云数据库中语法不生效
      let dbWhere = {
        _openid: openid,
        status: _.nin(['pending', 0])       // 排除未支付
      }
      if (this.data.currentTab === 1) {
        dbWhere.type = _.neq('recharge')
      } else if (this.data.currentTab === 2) {
        dbWhere.type = 'recharge'
      }
      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize
      const res = await db.collection('order')
        .where(dbWhere)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
      const formatTime = (time) => {
        if (!time) return ''
        const date = new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : n)
        return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
      }
      // JS 端过滤：只显示已支付（payStatus/pay_status 不为 false）的订单
      const paidData = (res.data || []).filter(order => {
        const ps = order.payStatus !== false && order.pay_status !== false
        return ps
      })
      const list = paidData.map(order => ({
        ...order,
        createTimeText: order.createTime ? formatTime(order.createTime) : '',
        orderTypeText: order.orderType === 'takeout' ? '外卖订单' : (order.orderType === 'dineIn' ? '堂食自取' : '点餐订单'),
        statusText: getStatusText(order.status),
        statusClass: getStatusClass(order.status)
      }))
      const newList = append ? this.data.orderList.concat(list) : list
      // 以原始查询结果判断是否还有更多数据
      const hasMore = (res.data || []).length >= pageSize
      this.setData({
        orderList: newList,
        orderPage: page,
        orderHasMore: hasMore
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loadingOrders: false })
    }
  },

  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },

  goOrderDetail(e) {
    const order = e.currentTarget.dataset.order
    if (!order) return
    wx.navigateTo({ url: `/pages/orderDetail/orderDetail?id=${order._id}` })
  },

  cancelOrder(e) {
    const order = e.currentTarget.dataset.order
    if (order.type === 'recharge') {
      wx.showToast({ title: '充值订单无法取消', icon: 'none' })
      return
    }
    if (order.status !== 0) {
      wx.showToast({ title: '该订单无法取消', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？余额将原路退回',
      success: async (res) => {
        if (res.confirm) await this.doCancelOrder(order)
      }
    })
  },

  async doCancelOrder(order) {
    wx.showLoading({ title: '处理中...' })
    try {
      const openid = app.globalData.openid
      await db.collection('order').doc(order._id).update({ data: { status: 3 } })
      if (order.useMiandan) {
        const miandanRes = await db.collection('freeBuy').where({ _openid: openid }).get()
        if (miandanRes.data.length) {
          await db.collection('freeBuy').doc(miandanRes.data[0]._id).update({
            data: { count: db.command.inc(1) }
          })
        }
      }
      if (order.finalPrice > 0) {
        const userRes = await db.collection('user').where({ _openid: openid }).get()
        if (userRes.data.length) {
          const user = userRes.data[0]
          await db.collection('user').doc(user._id).update({
            data: { balance: (user.balance || 0) + order.finalPrice }
          })
          // 记录余额变动日志（容错：集合不存在不影响取消操作）
          db.collection('balance_log').add({
            data: {
              _openid: openid,
              type: 'cancel',
              amount: order.finalPrice,
              description: `取消订单退款 +¥${order.finalPrice.toFixed(2)}`,
              orderId: order._id,
              createTime: new Date()
            }
          }).catch(err => console.error('记录balance_log失败（不影响取消）:', err))
        }
      }
      wx.hideLoading()
      wx.showToast({ title: '订单已取消', icon: 'success' })
      setTimeout(() => this.loadOrders(), 1500)
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    const list = (this.data.orderList || []).filter(o => o && o.goodsList && o.goodsList.length > 0)
    const pick = list[0] || null
    if (pick) {
      const statusText = (typeof pick.status === 'string') ? pick.status : ({0:'待支付',1:'已支付',2:'已完成',3:'已取消',4:'已退款'})[pick.status] || '已下单'
      return require('../../utils/share.js').shareMessage({
        type: 'order',
        title: '我的订单 · ' + (pick.shopName || getApp().globalData.shopName || '美食在线'),
        path: '/pages/myorder/myorder',
        order: {
          orderNo: pick.orderNo || pick._id,
          statusText,
          total: pick.actualPrice || pick.totalPrice || '',
          dishes: (pick.goodsList || []).slice(0, 3).map(g => ({ name: g.name, image: g.image, price: g.price }))
        }
      })
    }
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '我的订单', path: '/pages/myorder/myorder' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '我的订单', query: '' })
  }
})