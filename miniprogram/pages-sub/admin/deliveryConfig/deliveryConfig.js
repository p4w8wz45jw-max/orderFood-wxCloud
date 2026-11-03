// pages-sub/admin/deliveryConfig/deliveryConfig.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    config: {
      mapKey: '',
      shopLat: 0,
      shopLng: 0,
      tiers: [
        { min: 0, max: 2, fee: 0 },
        { min: 2, max: 5, fee: 5 },
        { min: 5, max: 10, fee: 10 }
      ]
    }
  },

  onLoad() {
    this.setThemeColor()
    this.loadConfig()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadConfig() {
    try {
      const res = await db.collection('deliveryConfig').limit(1).get()
      if (res.data.length > 0) {
        this.setData({ config: res.data[0] })
      }
    } catch (e) {
      console.error('加载配送配置失败', e)
    }
  },

  onMapKeyInput(e) {
    this.setData({ 'config.mapKey': e.detail.value })
  },

  onShopLatInput(e) {
    this.setData({ 'config.shopLat': Number(e.detail.value) || 0 })
  },

  onShopLngInput(e) {
    this.setData({ 'config.shopLng': Number(e.detail.value) || 0 })
  },

  async save() {
    if (!this.data.config.mapKey) {
      wx.showToast({ title: '请输入地图Key', icon: 'none' })
      return
    }
    try {
      const res = await db.collection('deliveryConfig').limit(1).get()
      if (res.data.length > 0) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'deliveryConfig', docId: res.data[0]._id, data: this.data.config }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'deliveryConfig', data: this.data.config }
        })
      }
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})