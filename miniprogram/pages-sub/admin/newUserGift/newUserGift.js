// pages-sub/admin/newUserGift/newUserGift.js
const app = getApp()

Page({
  data: {
    giftEnabled: false,
    couponId: '',
    couponList: [],
    selectedCoupon: null,
    couponIndex: -1,
    themeColor: '#e54d42'
  },

  onLoad() {
    this.setThemeColor()
  },

  onShow() {
    this.setThemeColor()
    this.loadConfig()
    this.loadCoupons()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
    this.setData({ themeColor })
  },

  async loadConfig() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'get', collection: 'config', docId: 'new_user_gift' }
      })
      if (res.result && res.result.success && res.result.data) {
        const data = res.result.data
        this.setData({
          giftEnabled: data.enable || false,
          couponId: data.couponId || ''
        })
      }
    } catch (err) {
      console.log('新用户赠礼配置不存在，使用默认值')
    }
  },

  async loadCoupons() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'find', collection: 'coupon' }
      })
      const couponList = (res.result && res.result.success && res.result.data) ? res.result.data : []
      this.setData({ couponList })
      if (this.data.couponId && couponList.length > 0) {
        const index = couponList.findIndex(c => c._id === this.data.couponId)
        this.setData({
          couponIndex: index,
          selectedCoupon: index >= 0 ? couponList[index] : null
        })
      }
    } catch (err) {
      console.error('加载优惠券列表失败', err)
    }
  },

  onGiftEnabledChange(e) {
    this.setData({ giftEnabled: e.detail.value })
  },

  onCouponChange(e) {
    const index = e.detail.value
    const coupon = this.data.couponList[index]
    this.setData({
      couponIndex: index,
      couponId: coupon ? coupon._id : '',
      selectedCoupon: coupon
    })
  },

  async saveConfig() {
    const { giftEnabled, couponId } = this.data

    if (giftEnabled && !couponId) {
      wx.showToast({ title: '请选择赠品优惠券', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      const dataToSave = { enable: giftEnabled, couponId, updateTime: new Date() }

      // 先尝试获取，存在则更新，否则创建
      const getRes = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'get', collection: 'config', docId: 'new_user_gift' }
      })
      if (getRes.result && getRes.result.success) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'config', docId: 'new_user_gift', data: dataToSave }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'set', collection: 'config', docId: 'new_user_gift', data: dataToSave }
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      try {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'set', collection: 'config', docId: 'new_user_gift', data: { enable: giftEnabled, couponId, updateTime: new Date() } }
        })
        wx.showToast({ title: '保存成功', icon: 'success' })
      } catch (err2) {
        console.error('保存失败(重试)', err2)
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})
