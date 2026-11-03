// pages/couponCenter/couponCenter.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    packages: [],
    loading: true,
    themeColor: '#B8956E'
  },

  onLoad() {
    this.setThemeColor()
    this.loadPackages()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadPackages() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })
    try {
      const res = await db.collection('ticket_packages')
        .where({ enable: true })
        .orderBy('price', 'asc')
        .get()
      this.setData({ packages: res.data || [] })
    } catch (err) {
      console.error('加载套票失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      wx.hideLoading()
    }
  },

  async buyPackage(e) {
    const pkg = e.currentTarget.dataset.pkg
    wx.showModal({
      title: '确认购买',
      content: `购买【${pkg.name}】，价格¥${pkg.price}，包含${pkg.couponCount}张【${pkg.couponName}】，确认购买吗？`,
      confirmText: '立即购买',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '购买中...' })
          try {
            const result = await wx.cloud.callFunction({
              name: 'buyTicketPackage',
              data: {
                packageId: pkg._id,
                price: pkg.price,
                couponId: pkg.couponId,
                couponCount: pkg.couponCount,
                couponName: pkg.couponName,
                expireDays: pkg.expireDays || 30
              }
            })
            if (result.result && result.result.success) {
              wx.showToast({ title: '购买成功！优惠券已发放', icon: 'success' })
              this.loadPackages()
            } else {
              throw new Error(result.result.error || '购买失败')
            }
          } catch (err) {
            console.error(err)
            wx.showToast({ title: err.message || '购买失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  goToCoupon() {
    wx.switchTab({ url: '/pages/coupon/coupon' })
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '优惠券中心 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/couponCenter/couponCenter' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '优惠券中心 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})