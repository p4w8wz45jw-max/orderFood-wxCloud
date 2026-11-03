// pages-sub/admin/pointsConfig/pointsConfig.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    enable: false,
    rules: [],
    showModal: false,
    editIndex: -1,
    form: {
      id: '',
      name: '',
      points: 0,
      type: 'coupon',
      couponId: '',
      couponName: '',
      productId: '',
      productName: '',
      description: '',
      image: ''
    },
    couponList: [],
    dishList: []
  },

  onLoad() {
    this.loadConfig()
    this.loadCoupons()
    this.loadDishes()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadConfig() {
    wx.showLoading({ title: '加载配置...' })
    try {
      const res = await db.collection('points_config').doc('config').get()
      this.setData({ enable: res.data.enable || false, rules: res.data.rules || [] })
    } catch (err) {
      console.error('加载配置失败', err)
      if (err.errCode === -502005) {
        wx.showModal({
          title: '配置未初始化',
          content: '是否自动创建配置文档？',
          success: async (modalRes) => {
            if (modalRes.confirm) {
              await this.createDefaultConfig()
            }
          }
        })
      } else {
        wx.showToast({ title: '加载失败：' + err.errMsg, icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  },

  async createDefaultConfig() {
    wx.showLoading({ title: '创建中...' })
    try {
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'set', collection: 'points_config', docId: 'config', data: { enable: false, rules: [] } }
      })
      this.setData({ enable: false, rules: [] })
      wx.showToast({ title: '创建成功', icon: 'success' })
    } catch (err) {
      console.error('创建失败', err)
      wx.showToast({ title: '创建失败，请手动添加', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async loadCoupons() {
    try {
      const res = await db.collection('coupon').get()
      this.setData({ couponList: res.data })
    } catch (err) { console.error(err) }
  },

  async loadDishes() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'dish' }
      })
      const result = res.result || {}
      const allDishes = result.success ? (result.data || []) : []
      this.setData({ dishList: allDishes })
    } catch (err) { console.error(err) }
  },

  onEnableChange(e) {
    this.setData({ enable: e.detail.value })
    this.saveConfig()
  },

  addRule() {
    this.setData({
      showModal: true,
      editIndex: -1,
      form: {
        id: Date.now().toString(),
        name: '',
        points: 0,
        type: 'coupon',
        couponId: '',
        couponName: '',
        productId: '',
        productName: '',
        description: '',
        image: ''
      }
    })
  },

  editRule(e) {
    const index = e.currentTarget.dataset.index
    const rule = this.data.rules[index]
    this.setData({
      showModal: true,
      editIndex: index,
      form: { ...rule }
    })
  },

  closeModal() {
    this.setData({ showModal: false })
  },

  onNameInput(e) { this.setData({ 'form.name': e.detail.value }) },
  onPointsInput(e) { this.setData({ 'form.points': parseInt(e.detail.value) || 0 }) },
  onTypeChange(e) {
    this.setData({ 'form.type': e.detail.value })
  },
  onCouponChange(e) {
    const idx = e.detail.value
    const coupon = this.data.couponList[idx]
    if (coupon) {
      this.setData({
        'form.couponId': coupon._id,
        'form.couponName': coupon.name
      })
    }
  },
  onProductChange(e) {
    const idx = e.detail.value
    const dish = this.data.dishList[idx]
    if (dish) {
      this.setData({
        'form.productId': dish._id,
        'form.productName': dish.name
      })
    }
  },
  onDescriptionInput(e) { this.setData({ 'form.description': e.detail.value }) },

  // 上传图片
  async uploadImage() {
    const res = await wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera']
    })
    const tempFilePath = res.tempFilePaths[0]
    wx.showLoading({ title: '上传中...' })
    try {
      const cloudPath = `pointsMall/${Date.now()}_${Math.random().toString(36).substr(2)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath
      })
      this.setData({ 'form.image': uploadRes.fileID })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 删除图片
  removeImage() {
    this.setData({ 'form.image': '' })
  },

  async saveRule() {
    const { form, editIndex, rules } = this.data
    if (!form.name) { wx.showToast({ title: '请输入商品名称', icon: 'none' }); return }
    if (form.points <= 0) { wx.showToast({ title: '积分必须大于0', icon: 'none' }); return }
    if (form.type === 'coupon' && !form.couponId) { wx.showToast({ title: '请选择优惠券', icon: 'none' }); return }
    if (form.type === 'product' && !form.productId) { wx.showToast({ title: '请选择商品', icon: 'none' }); return }

    const ruleToSave = {
      id: form.id,
      name: form.name,
      points: form.points,
      type: form.type,
      couponId: form.couponId,
      productId: form.productId,
      description: form.description,
      image: form.image || ''
    }

    let newRules = [...rules]
    if (editIndex === -1) {
      newRules.push(ruleToSave)
    } else {
      newRules[editIndex] = ruleToSave
    }
    this.setData({ rules: newRules, showModal: false })
    await this.saveConfig()
  },

  deleteRule(e) {
    const index = e.currentTarget.dataset.index
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: async (res) => {
        if (res.confirm) {
          const newRules = [...this.data.rules]
          newRules.splice(index, 1)
          this.setData({ rules: newRules })
          await this.saveConfig()
        }
      }
    })
  },

  // 使用云函数保存（关键）
  async saveConfig() {
    wx.showLoading({ title: '保存中...' })
    try {
      const result = await wx.cloud.callFunction({
        name: 'updatePointsConfig',
        data: {
          enable: this.data.enable,
          rules: this.data.rules
        }
      })
      if (result.result && result.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        throw new Error(result.result.error || '保存失败')
      }
    } catch (err) {
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败：' + (err.message || err.errMsg), icon: 'none' })
    } finally {
      wx.hideLoading()
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