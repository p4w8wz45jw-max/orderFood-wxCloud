// pages/pointMall/pointMall.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    rules: [],
    userPoints: 0,
    loading: true,
    themeColor: '#B8956E',
    showPointsDetail: false,
    pointsHistory: [],
    pointsDetailLoading: false
  },

  onLoad() {
    this.setThemeColor()
    this.loadUserPoints()
    this.loadExchangeRules()
  },

  onShow() {
    this.setThemeColor()
    this.loadUserPoints()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadUserPoints() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({ _openid: openid }).get()
      if (res.data.length) {
        this.setData({ userPoints: res.data[0].points || 0 })
      }
    } catch (err) {
      console.error(err)
    }
  },

  async loadExchangeRules() {
    this.setData({ loading: true })
    try {
      const res = await db.collection('points_config').doc('config').get()
      const config = res.data || { enable: false, rules: [] }
      if (!config.enable) {
        wx.showModal({
          title: '提示',
          content: '积分活动暂未开启',
          showCancel: false,
          success: () => wx.navigateBack()
        })
        return
      }
      const rules = config.rules || []
      for (let rule of rules) {
        if (rule.type === 'coupon' && rule.couponId) {
          try {
            const couponRes = await db.collection('coupon').doc(rule.couponId).get()
            rule.couponName = couponRes.data ? couponRes.data.name : '优惠券'
          } catch (e) { rule.couponName = '优惠券' }
        } else if (rule.type === 'product' && rule.productId) {
          try {
            const dishRes = await db.collection('dish').doc(rule.productId).get()
            rule.productName = dishRes.data ? dishRes.data.name : '商品券'
          } catch (e) { rule.productName = '商品券' }
        }
      }
      this.setData({ rules })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async exchange(e) {
    const rule = e.currentTarget.dataset.rule
    if (this.data.userPoints < rule.points) {
      wx.showToast({ title: '积分不足', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认兑换',
      content: `消耗 ${rule.points} 积分兑换 ${rule.name}，确认吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '兑换中...' })
          try {
            const result = await wx.cloud.callFunction({
              name: 'exchangePoints',
              data: {
                ruleId: rule.id,
                points: rule.points,
                type: rule.type,
                couponId: rule.couponId,
                productId: rule.productId,
                name: rule.name
              }
            })
            if (result.result && result.result.success) {
              wx.showToast({ title: '兑换成功', icon: 'success' })
              this.loadUserPoints()
            } else {
              throw new Error(result.result.error || '兑换失败')
            }
          } catch (err) {
            console.error(err)
            wx.showToast({ title: err.message || '兑换失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  // 显示积分明细
  showPointsDetail() {
    this.setData({ showPointsDetail: true })
    this.loadPointsHistory()
  },

  // 关闭积分明细
  closePointsDetail() {
    this.setData({ showPointsDetail: false })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 加载积分历史
  async loadPointsHistory() {
    this.setData({ pointsDetailLoading: true })
    try {
      const openid = app.globalData.openid
      const _ = db.command
      const res = await db.collection('points_log')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()

      const typeLabel = { earn: '消费获取', spend: '积分兑换', refund_deduct: '退款扣除', admin_adjust: '管理员调整' }
      const list = res.data.map(item => ({
        id: item._id,
        type: item.type || 'spend',
        amount: item.amount || 0,
        isIncome: (item.amount || 0) > 0,
        reason: item.description || item.reason || (typeLabel[item.type] || '积分变动'),
        date: this.formatTime(item.createTime),
        rawTime: item.createTime
      }))

      this.setData({ pointsHistory: list })
    } catch (err) {
      console.error('加载积分历史失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ pointsDetailLoading: false })
    }
  },

  // 格式化时间
  formatTime(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    const h = d.getHours().toString().padStart(2, '0')
    const min = d.getMinutes().toString().padStart(2, '0')
    const s = d.getSeconds().toString().padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}:${s}`
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '积分商城 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/pointMall/pointMall' })
  },

  onShareTimeline() {
    return {
      title: '积分商城 - 餐饮点餐'
    }
  }
})