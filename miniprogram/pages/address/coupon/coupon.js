// pages/coupon/coupon.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    coupons: [],
    status: 'unused',
    loading: true
  },

  onLoad() {
    this.loadCoupons()
  },

  async loadCoupons() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中' })
    try {
      const openid = app.globalData.openid
      if (!openid) {
        console.warn('openid 为空，请先登录')
        this.setData({ loading: false, coupons: [] })
        wx.hideLoading()
        return
      }
      const res = await db.collection('user_coupons')
        .where({ _openid: openid })
        .orderBy('expireTime', 'asc')
        .get()
      console.log('优惠券数据:', res.data)
      const now = new Date()
      const coupons = res.data.map(c => ({
        ...c,
        isExpired: new Date(c.expireTime) < now,
        expireText: new Date(c.expireTime).toLocaleDateString()
      }))
      this.setData({ coupons, loading: false })
    } catch (err) {
      console.error('加载优惠券失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    } finally {
      wx.hideLoading()
    }
  },

  switchTab(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ status })
  },

  useCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon
    if (!coupon) {
      wx.showToast({ title: '优惠券无效', icon: 'none' })
      return
    }
    // 商品券：存储为待处理优惠券，点餐页会自动加购对应菜品
    if (coupon.type === 'product' && coupon.productId) {
      wx.setStorageSync('pendingCoupon', coupon)
    } else {
      wx.setStorageSync('selectedCoupon', coupon)
      wx.removeStorageSync('pendingCoupon')
    }
    wx.switchTab({ url: '/pages/index/index' })
    wx.showToast({ title: '已选中优惠券，去下单吧', icon: 'success' })
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})