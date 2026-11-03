// pages/start/start.js
const app = getApp()
const db = wx.cloud.database()

// 固定暖棕主题色
const THEME_COLOR = '#B8956E'

Page({
  data: {
    bgImage: '',
    showPopup: false,
    popupImage: '',
    selectedMode: '',
    themeColor: THEME_COLOR,
    shopName: '巷里食堂',
    shopBusinessHours: '',
    shopAddress: '',
    shopIntro: '',
    shopContactPhone: ''
  },

  async onLoad() {
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: THEME_COLOR })
    await this.loadShopInfo()
    await this.loadBgImage()
    await this.loadPopupImage()
  },

  onShow() {
    this.loadShopInfo()
  },

  async loadShopInfo() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data.length) {
        const shop = res.data[0]
        this.setData({
          shopName: shop.name || '巷里食堂',
          shopBusinessHours: shop.businessHours || '',
          shopAddress: shop.address || '',
          shopIntro: shop.intro || '',
          shopContactPhone: shop.contactPhone || ''
        })
      }
    } catch (err) {
      console.error('加载店铺信息失败', err)
    }
  },

  async loadBgImage() {
    try {
      const res = await db.collection('config').doc('config').get()
      const fileID = res.data.startBg
      if (fileID) {
        const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (urlRes.fileList && urlRes.fileList.length > 0) {
          this.setData({ bgImage: urlRes.fileList[0].tempFileURL })
        }
      }
    } catch (err) {
      console.error('加载背景失败', err)
    }
  },

  async loadPopupImage() {
    try {
      const res = await db.collection('config').doc('config').get()
      const fileID = res.data.startPopupImage
      if (fileID) {
        const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (urlRes.fileList && urlRes.fileList.length > 0) {
          this.setData({ popupImage: urlRes.fileList[0].tempFileURL })
        }
      }
    } catch (err) {
      console.error('加载弹窗图片失败', err)
    }
  },

  chooseDineIn() {
    const mode = 'dineIn'
    if (this.data.popupImage) {
      this.setData({ showPopup: true, selectedMode: mode })
    } else {
      this.goToIndex(mode)
    }
  },

  chooseTakeOut() {
    const mode = 'takeOut'
    if (this.data.popupImage) {
      this.setData({ showPopup: true, selectedMode: mode })
    } else {
      this.goToIndex(mode)
    }
  },

  closePopup() {
    this.setData({ showPopup: false })
    if (this.data.selectedMode) {
      this.goToIndex(this.data.selectedMode)
    }
  },

  goToIndex(mode) {
    app.globalData.orderMode = mode === 'dineIn' ? 'dineIn' : 'takeOut'
    wx.switchTab({ url: '/pages/index/index' })
  },

  callPhone() {
    if (this.data.shopContactPhone) {
      wx.makePhoneCall({ phoneNumber: this.data.shopContactPhone })
    } else {
      wx.showToast({ title: '暂无联系方式', icon: 'none' })
    }
  },

  stopPropagation() {},

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})