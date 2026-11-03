// pages-sub/admin/lotteryConfig/lotteryConfig.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    config: {
      enable: false,
      dailyLimit: 1,
      rules: []
    },
    prizeTypes: ['普通奖品', '优惠券', '谢谢参与', '商品券'],
    saving: false,
    prizeTypesMap: {
      '普通奖品': 'normal',
      '优惠券': 'coupon',
      '谢谢参与': 'thanks',
      '商品券': 'product'
    },
    couponList: [],
    showCouponPicker: false,
    currentCouponIndex: 0
  },

  onLoad() {
    this.setThemeColor()
    this.loadCouponList()
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

  async loadCouponList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'coupon' }
      })
      const result = res.result || {}
      const allCoupons = result.success ? (result.data || []) : []
      this.setData({ couponList: allCoupons })
    } catch (err) {
      console.error(err)
    }
  },

  async loadConfig() {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await db.collection('lottery_config').doc('config').get()
      if (res.data) {
        const rules = (res.data.rules || []).map(rule => {
          let typeIndex = 0
          if (rule.type === 'coupon') typeIndex = 1
          if (rule.type === 'thanks') typeIndex = 2
          if (rule.type === 'product') typeIndex = 3
          let couponName = ''
          if (rule.couponId) {
            const found = this.data.couponList.find(c => c._id === rule.couponId)
            couponName = found ? found.name : rule.couponId
          }
          return { ...rule, typeIndex, couponName }
        })
        this.setData({
          config: {
            ...res.data,
            rules,
            enable: res.data.enable || false,
            dailyLimit: res.data.dailyLimit || 1
          }
        })
      } else {
        // 没有配置时，使用空配置（不报错）
        this.setData({ config: { enable: false, dailyLimit: 1, rules: [] } })
      }
    } catch (err) {
      console.error('加载配置失败', err)
      // 如果文档不存在，不弹错误提示，使用空配置
      if (err.errCode !== -502005) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  },

  onEnableChange(e) { this.setData({ 'config.enable': e.detail.value }) },
  onDailyLimitInput(e) { this.setData({ 'config.dailyLimit': parseInt(e.detail.value) || 0 }) },

  addPrize() {
    const rules = this.data.config.rules
    rules.push({
      name: '新奖品',
      type: 'normal',
      typeIndex: 0,
      probability: 5,
      imageUrl: '',
      couponId: '',
      couponName: ''
    })
    this.setData({ 'config.rules': rules })
  },
  deletePrize(e) {
    const idx = e.currentTarget.dataset.index
    const rules = [...this.data.config.rules]; rules.splice(idx, 1)
    this.setData({ 'config.rules': rules })
  },
  onPrizeNameInput(e) { this.setData({ [`config.rules[${e.currentTarget.dataset.index}].name`]: e.detail.value }) },
  onPrizeTypeChange(e) {
    const idx = e.currentTarget.dataset.index
    const typeIndex = parseInt(e.detail.value)
    const typeName = this.data.prizeTypes[typeIndex]
    const type = this.data.prizeTypesMap[typeName]
    const update = {
      [`config.rules[${idx}].typeIndex`]: typeIndex,
      [`config.rules[${idx}].type`]: type
    }
    if (type !== 'coupon' && type !== 'product') {
      update[`config.rules[${idx}].couponId`] = ''
      update[`config.rules[${idx}].couponName`] = ''
    }
    this.setData(update)
  },

  showCouponSelector(e) {
    const index = e.currentTarget.dataset.index
    if (this.data.couponList.length === 0) {
      wx.showToast({ title: '暂无可用优惠券，请先创建', icon: 'none' })
      return
    }
    this.setData({
      showCouponPicker: true,
      currentCouponIndex: index
    })
  },

  selectCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon
    const index = this.data.currentCouponIndex
    this.setData({
      [`config.rules[${index}].couponId`]: coupon._id,
      [`config.rules[${index}].couponName`]: coupon.name,
      [`config.rules[${index}].name`]: coupon.name,
      showCouponPicker: false
    })
  },

  clearCoupon(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`config.rules[${index}].couponId`]: '',
      [`config.rules[${index}].couponName`]: '',
      [`config.rules[${index}].name`]: '新奖品'
    })
  },

  closeCouponPicker() { this.setData({ showCouponPicker: false }) },
  onProbabilityInput(e) { this.setData({ [`config.rules[${e.currentTarget.dataset.index}].probability`]: parseFloat(e.detail.value) || 0 }) },
  async uploadPrizeImage(e) {
    const index = e.currentTarget.dataset.index
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `lottery/prize_${Date.now()}_${index}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: res.tempFilePaths[0] })
          const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
          this.setData({
            [`config.rules[${index}].imageUrl`]: uploadRes.fileID,
            [`config.rules[${index}].imageTempUrl`]: tempUrlRes.fileList[0].tempFileURL
          })
          wx.showToast({ title: '上传成功', icon: 'success' })
        } catch (err) {
          console.error(err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 保存配置：调用云函数
  async saveConfig() {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    try {
      const { config } = this.data
      const total = config.rules.reduce((s, r) => s + (r.probability || 0), 0)
      if (Math.abs(total - 100) > 0.01) {
        wx.showToast({ title: '奖品概率总和必须为100%', icon: 'none' })
        return
      }
      for (let r of config.rules) {
        if ((r.type === 'coupon' || r.type === 'product') && !r.couponId) {
          wx.showToast({ title: `奖品"${r.name}"未选择优惠券`, icon: 'none' })
          return
        }
      }

      const rulesToSave = config.rules.map(r => {
        const { imageTempUrl, typeIndex, couponName, ...clean } = r
        return clean
      })

      const toSave = {
        enable: config.enable,
        dailyLimit: config.dailyLimit,
        rules: rulesToSave,
        updateTime: new Date()
      }

      const res = await wx.cloud.callFunction({
        name: 'saveLotteryConfig',
        data: { data: toSave }
      })

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.loadConfig() // 重新加载
      } else {
        throw new Error(res.result ? res.result.message : '保存失败')
      }
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '保存失败：' + err.message, icon: 'none' })
    } finally {
      this.setData({ saving: false })
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