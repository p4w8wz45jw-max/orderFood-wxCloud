// pages-sub/admin/shopInfo/shopInfo.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    shopinfo: {
      _id: '',
      name: '',
      intro: '',
      businessHours: '',
      address: '',
      contactPhone: '',
      servicePhone: '',
      serviceQrcode: '',
      description: '',
      location: { lat: null, lng: null },
      deliveryFeeRules: {
        baseFee: 0,
        baseDistance: 3000,
        perKmFee: 2,
        maxDistance: 20000,
        freeDeliveryThreshold: 0      // 新增：满额免配送费门槛（元）
      },
      minDeliveryAmount: 0,
      adminPushSettings: {
        enableNewOrderMsg: false,
        newOrderMsgTemplateId: '',
        useOfficialAccount: false,
        useQyWechat: false,
        oaAppId: '',
        oaAppSecret: '',
        oaTemplateId: '',
        qyWechatWebhook: ''
      },
      themeColor: '#B8956E',
      timeSlots: [],
      freeLotteryThreshold: 0,        // 新增：满额送抽奖门槛（元）
      isOpen: true                    // 新增：开店/闭店开关
    },
    timeSlotsText: ''
  },

  onLoad() {
    this.setThemeColor()
    this.loadShopInfo()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadShopInfo() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data && res.data.length > 0) {
        const data = res.data[0]
        if (!data.adminPushSettings) data.adminPushSettings = { enableNewOrderMsg: false, newOrderMsgTemplateId: '' }
        if (data.minDeliveryAmount === undefined) data.minDeliveryAmount = 0
        if (!data.themeColor) data.themeColor = '#B8956E'
        if (!data.timeSlots) data.timeSlots = []
        if (!data.intro) data.intro = ''
        if (!data.businessHours) data.businessHours = ''
        if (!data.address) data.address = ''
        if (!data.contactPhone) data.contactPhone = ''
        if (!data.servicePhone) data.servicePhone = ''
        if (!data.serviceQrcode) data.serviceQrcode = ''
        if (!data.deliveryFeeRules.freeDeliveryThreshold && data.deliveryFeeRules.freeDeliveryThreshold !== 0) data.deliveryFeeRules.freeDeliveryThreshold = 0
        if (data.freeLotteryThreshold === undefined) data.freeLotteryThreshold = 0
        if (data.isOpen === undefined) data.isOpen = true
        this.setData({ shopinfo: data })
        this.setData({ timeSlotsText: data.timeSlots.join('\n') })
      }
    } catch (err) {
      console.error(err)
    }
  },

  onNameInput(e) { this.setData({ 'shopinfo.name': e.detail.value }) },
  onIntroInput(e) { this.setData({ 'shopinfo.intro': e.detail.value }) },
  onBusinessHoursInput(e) { this.setData({ 'shopinfo.businessHours': e.detail.value }) },
  onAddressInput(e) { this.setData({ 'shopinfo.address': e.detail.value }) },
  onContactPhoneInput(e) { this.setData({ 'shopinfo.contactPhone': e.detail.value }) },
  onServicePhoneInput(e) { this.setData({ 'shopinfo.servicePhone': e.detail.value }) },
  onDescriptionInput(e) { this.setData({ 'shopinfo.description': e.detail.value }) },

  // 上传客服二维码
  uploadServiceQrcode() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `qrcode/service_${Date.now()}.png`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: res.tempFilePaths[0]
          })
          this.setData({ 'shopinfo.serviceQrcode': uploadRes.fileID })
          wx.hideLoading()
          wx.showToast({ title: '上传成功', icon: 'success' })
        } catch (err) {
          wx.hideLoading()
          console.error('上传二维码失败', err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  },

  // 预览客服二维码
  previewServiceQrcode() {
    wx.previewImage({
      urls: [this.data.shopinfo.serviceQrcode],
      current: this.data.shopinfo.serviceQrcode
    })
  },

  // 删除客服二维码
  deleteServiceQrcode() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除客服二维码吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ 'shopinfo.serviceQrcode': '' })
        }
      }
    })
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'shopinfo.location.lat': res.latitude,
          'shopinfo.location.lng': res.longitude
        })
      }
    })
  },

  onBaseFeeInput(e) { this.setData({ 'shopinfo.deliveryFeeRules.baseFee': parseFloat(e.detail.value) || 0 }) },
  onBaseDistanceInput(e) { this.setData({ 'shopinfo.deliveryFeeRules.baseDistance': parseInt(e.detail.value) || 0 }) },
  onPerKmFeeInput(e) { this.setData({ 'shopinfo.deliveryFeeRules.perKmFee': parseFloat(e.detail.value) || 0 }) },
  onMaxDistanceInput(e) { this.setData({ 'shopinfo.deliveryFeeRules.maxDistance': parseInt(e.detail.value) || 0 }) },
  onFreeDeliveryThresholdInput(e) { this.setData({ 'shopinfo.deliveryFeeRules.freeDeliveryThreshold': parseFloat(e.detail.value) || 0 }) },
  onFreeLotteryThresholdInput(e) { this.setData({ 'shopinfo.freeLotteryThreshold': parseFloat(e.detail.value) || 0 }) },

  onMinDeliveryAmountInput(e) {
    this.setData({ 'shopinfo.minDeliveryAmount': parseFloat(e.detail.value) || 0 })
  },

onEnableAdminOrderMsgChange(e) { this.setData({ 'shopinfo.adminPushSettings.enableNewOrderMsg': e.detail.value }) },
onAdminOrderMsgTemplateIdInput(e) { this.setData({ 'shopinfo.adminPushSettings.newOrderMsgTemplateId': e.detail.value }) },
onUseOfficialAccountChange(e) { this.setData({ 'shopinfo.adminPushSettings.useOfficialAccount': e.detail.value }) },
onOaAppIdInput(e) { this.setData({ 'shopinfo.adminPushSettings.oaAppId': e.detail.value }) },
onOaAppSecretInput(e) { this.setData({ 'shopinfo.adminPushSettings.oaAppSecret': e.detail.value }) },
onOaTemplateIdInput(e) { this.setData({ 'shopinfo.adminPushSettings.oaTemplateId': e.detail.value }) },
onQyWechatWebhookInput(e) { this.setData({ 'shopinfo.adminPushSettings.qyWechatWebhook': e.detail.value }) },
onUseQyWechatChange(e) { this.setData({ 'shopinfo.adminPushSettings.useQyWechat': e.detail.value }) },

onIsOpenChange(e) { this.setData({ 'shopinfo.isOpen': e.detail.value }) },

  onTimeSlotsInput(e) {
    const text = e.detail.value
    this.setData({ timeSlotsText: text })
    const slots = text.split('\n').filter(line => line.trim().length > 0)
    this.setData({ 'shopinfo.timeSlots': slots })
  },

  async saveShopInfo() {
    const info = this.data.shopinfo
    if (!info.name) { wx.showToast({ title: '请输入店铺名称', icon: 'none' }); return }
    if (!info.location.lat || !info.location.lng) { wx.showToast({ title: '请选择店铺位置', icon: 'none' }); return }

    const dataToSave = {
      name: info.name,
      intro: info.intro,
      businessHours: info.businessHours,
      address: info.address,
      contactPhone: info.contactPhone,
      servicePhone: info.servicePhone,
      serviceQrcode: info.serviceQrcode,
      description: info.description,
      location: { lat: info.location.lat, lng: info.location.lng },
      deliveryFeeRules: info.deliveryFeeRules,
      minDeliveryAmount: info.minDeliveryAmount,
      adminPushSettings: info.adminPushSettings,
      timeSlots: info.timeSlots,
      freeLotteryThreshold: info.freeLotteryThreshold,
      isOpen: info.isOpen
    }

    wx.showLoading({ title: '保存中' })
    try {
      // 通过云函数保存，绕过 _openid 权限限制
      if (info._id) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'shopinfo', docId: info._id, data: dataToSave }
        })
      } else {
        const addRes = await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'shopinfo', data: dataToSave }
        })
        if (addRes.result && addRes.result.success) {
          this.setData({ 'shopinfo._id': addRes.result._id })
        }
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败：' + (err.errMsg || err.message), icon: 'none' })
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})