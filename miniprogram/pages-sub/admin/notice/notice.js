// pages-sub/admin/notice/notice.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    rechargeNotice: ''
  },

  onLoad() {
    this.loadRechargeNotice()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadRechargeNotice() {
    try {
      const res = await db.collection('config').doc('config').get()
      this.setData({ rechargeNotice: res.data.rechargeNotice || '' })
    } catch (err) {
      if (err.errCode === -502005) {
        this.setData({ rechargeNotice: '' })
      } else {
        console.error('加载充值说明失败', err)
      }
    }
  },

  onRechargeNoticeInput(e) {
    this.setData({ rechargeNotice: e.detail.value })
  },

  async saveRechargeNotice() {
    wx.showLoading({ title: '保存中...' })
    try {
      const result = await wx.cloud.callFunction({
        name: 'saveRechargeNotice',
        data: { rechargeNotice: this.data.rechargeNotice }
      })
      if (result.result && result.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        await this.loadRechargeNotice()
      } else {
        throw new Error(result.result.error || '保存失败')
      }
    } catch (err) {
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败：' + err.message, icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ title: '店铺公告 - 餐饮点餐', path: '/pages/notice/notice' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ title: '店铺公告 - 餐饮点餐' })
  }
})