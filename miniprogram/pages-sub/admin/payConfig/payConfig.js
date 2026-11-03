// pages-sub/admin/payConfig/payConfig.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    config: {
      mchId: '',
      apiKey: '',
      notifyUrl: ''
    },
    saving: false
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
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadConfig() {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await db.collection('payConfig').doc('payConfig').get()
      this.setData({ config: res.data })
    } catch (err) {
      // 文档不存在，允许保存时创建
      if (err.errCode === -502005) {
        console.log('配置文档不存在，将新建')
      } else {
        console.error('加载失败', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  },

  onMchIdInput(e) {
    this.setData({ 'config.mchId': e.detail.value })
  },
  onApiKeyInput(e) {
    this.setData({ 'config.apiKey': e.detail.value })
  },
  onNotifyUrlInput(e) {
    this.setData({ 'config.notifyUrl': e.detail.value })
  },

  async saveConfig() {
    const { config } = this.data
    if (!config.mchId) {
      wx.showToast({ title: '请输入商户号', icon: 'none' })
      return
    }
    if (!config.apiKey) {
      wx.showToast({ title: '请输入API密钥', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    try {
      // 使用 set 方法：文档存在则覆盖，不存在则创建（必须指定 _id）
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'set', collection: 'payConfig', docId: 'payConfig', data: {
          mchId: config.mchId,
          apiKey: config.apiKey,
          notifyUrl: config.notifyUrl || '',
          updateTime: db.serverDate()
        } }
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('保存失败详情:', err)
      wx.showModal({
        title: '保存失败',
        content: `错误信息：${err.errMsg || err.message}\n\n请检查数据库权限：将 payConfig 集合权限设为“所有用户可读，仅管理员可写”`,
        showCancel: false
      })
    } finally {
      this.setData({ saving: false })
      wx.hideLoading()
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})