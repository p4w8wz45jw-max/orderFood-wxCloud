// pages/coupon/coupon.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    coupons: [],
    status: 'unused',
    loading: true,
    themeColor: '#B8956E'
  },

  onLoad() {
    this.setThemeColor()
    this.loadCoupons()
  },

  onShow() {
    this.setThemeColor()
    this.loadCoupons()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadCoupons() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中' })
    try {
      const openid = app.globalData.openid
      console.log('当前用户 openid:', openid)
      if (!openid) {
        console.warn('openid 为空')
        this.setData({ coupons: [], loading: false })
        wx.hideLoading()
        return
      }

      const res = await db.collection('user_coupons')
        .where({ _openid: openid })
        .get()
      console.log('查询到记录数:', res.data.length)

      if (res.data.length === 0) {
        this.setData({ coupons: [], loading: false })
        wx.hideLoading()
        return
      }

      const now = new Date()
      const processed = res.data.map(c => {
        let expireTime = c.expireTime instanceof Date ? c.expireTime : new Date(c.expireTime)
        let isExpired = expireTime < now
        let valueText = ''
        if (c.type === 'full_reduction') {
          valueText = `满${c.condition}减${c.value}`
        } else if (c.type === 'discount') {
          valueText = `${c.discount * 10}折`
        } else if (c.type === 'product') {
          valueText = '商品券'
        } else {
          valueText = c.name || '优惠券'
        }
        return {
          ...c,
          isExpired,
          expireText: expireTime.toLocaleDateString(),
          valueText
        }
      })

      let filtered = []
      if (this.data.status === 'unused') {
        filtered = processed.filter(c => !c.used && !c.isExpired)
      } else if (this.data.status === 'used') {
        filtered = processed.filter(c => c.used)
      } else {
        filtered = processed.filter(c => !c.used && c.isExpired)
      }

      console.log(`过滤后数量 (${this.data.status}):`, filtered.length)
      this.setData({ coupons: filtered, loading: false })
    } catch (err) {
      console.error('加载失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ coupons: [], loading: false })
    } finally {
      wx.hideLoading()
    }
  },

  switchTab(e) {
    const status = e.currentTarget.dataset.status
    console.log('切换标签:', status)
    if (!status) return
    this.setData({ status }, () => {
      this.loadCoupons()
    })
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
      // 非商品券：仅存储选中优惠券
      wx.setStorageSync('selectedCoupon', coupon)
      wx.removeStorageSync('pendingCoupon')
    }
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '我的优惠券 · ' + (getApp().globalData.shopName || '美食在线') })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '我的优惠券 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})