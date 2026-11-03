// pages-sub/admin/inviteConfig/inviteConfig.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    inviteEnabled: false,
    rewardCouponId: '',
    couponList: [],
    selectedCoupon: null,
    couponIndex: -1,
    inviteDesc: '',
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
      const res = await db.collection('config').doc('invite_reward').get()
      if (res.data) {
        const data = res.data
        this.setData({
          inviteEnabled: data.inviteEnabled || false,
          rewardCouponId: data.rewardCouponId || '',
          inviteDesc: data.inviteDesc || '邀请好友下单，双方各得一张优惠券！'
        })
      }
    } catch (err) {
      // 配置不存在，使用默认值
      console.log('邀请奖励配置不存在，使用默认值')
    }
  },

  async loadCoupons() {
    try {
      const res = await db.collection('coupon').get()
      this.setData({ couponList: res.data || [] })
      // 如果已有选中的优惠券ID，设置默认选中项
      if (this.data.rewardCouponId && res.data) {
        const index = res.data.findIndex(c => c._id === this.data.rewardCouponId)
        this.setData({
          couponIndex: index,
          selectedCoupon: index >= 0 ? res.data[index] : null
        })
      }
    } catch (err) {
      console.error('加载优惠券列表失败', err)
    }
  },

  onInviteEnabledChange(e) {
    this.setData({ inviteEnabled: e.detail.value })
  },

  onInviteDescInput(e) {
    this.setData({ inviteDesc: e.detail.value })
  },

  onCouponChange(e) {
    const index = e.detail.value
    const coupon = this.data.couponList[index]
    this.setData({
      couponIndex: index,
      rewardCouponId: coupon ? coupon._id : '',
      selectedCoupon: coupon
    })
  },

  async saveConfig() {
    const { inviteEnabled, rewardCouponId, inviteDesc } = this.data

    if (inviteEnabled && !rewardCouponId) {
      wx.showToast({ title: '请选择奖励优惠券', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      // 通过云函数保存，绕过 _openid 权限限制
      const getRes = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'get', collection: 'config', docId: 'invite_reward' }
      })
      const dataToSave = { inviteEnabled, rewardCouponId, inviteDesc, updateTime: new Date() }
      if (getRes.result && getRes.result.success) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'config', docId: 'invite_reward', data: dataToSave }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'set', collection: 'config', docId: 'invite_reward', data: dataToSave }
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      // 如果上面失败，直接用 set 覆盖式写入
      try {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'set', collection: 'config', docId: 'invite_reward', data: { inviteEnabled, rewardCouponId, inviteDesc, updateTime: new Date() } }
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
