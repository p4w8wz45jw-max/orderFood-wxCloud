// pages-sub/admin/pageLayout/pageLayout.js
const db = wx.cloud.database()

Page({
  data: {
    startBg: '',
    lotteryBg: '',
    startPopupImage: '',   // 开始页宣传弹窗图片
    rewardPopupImage: '',  // 结算成功抽奖弹窗图片
    carouselImages: [],    // 点餐页轮播广告图
    saving: false
  },

  onLoad() {
    console.log('页面加载，开始读取配置')
    this.loadLayout()
  },

  async loadLayout() {
    console.log('loadLayout 开始执行')
    wx.showLoading({ title: '加载中' })
    try {
      const res = await db.collection('config').doc('config').get()
      console.log('读取到的数据：', res.data)
      this.setData({
        startBg: res.data.startBg || '',
        lotteryBg: res.data.lotteryBg || '',
        startPopupImage: res.data.startPopupImage || '',
        rewardPopupImage: res.data.rewardPopupImage || '',
        carouselImages: res.data.carouselImages || []
      })
      console.log('设置后的数据：', this.data.startBg, this.data.lotteryBg, this.data.startPopupImage, this.data.rewardPopupImage)
    } catch (err) {
      console.error('加载失败：', err)
      if (err.errCode === -502005) {
        // 文档不存在，创建新文档
        console.log('文档不存在，创建新文档')
        try {
          await wx.cloud.callFunction({
            name: 'adminSaveData',
            data: { action: 'set', collection: 'config', docId: 'config', data: { 
              startBg: '', 
              lotteryBg: '',
              startPopupImage: '',
              rewardPopupImage: '',
              carouselImages: []
            } }
          })
          this.setData({ startBg: '', lotteryBg: '', startPopupImage: '', rewardPopupImage: '', carouselImages: [] })
          console.log('创建成功')
        } catch (addErr) {
          console.error('创建失败：', addErr)
          wx.showToast({ title: '创建配置失败', icon: 'none' })
        }
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  },

  // 上传开始页面背景图
  chooseStartBg() {
    console.log('点击选择开始页面背景')
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        console.log('选择图片成功', res.tempFilePaths[0])
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `pageLayout/start_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: res.tempFilePaths[0] })
          console.log('上传成功，fileID：', uploadRes.fileID)
          this.setData({ startBg: uploadRes.fileID })
          wx.showToast({ title: '上传成功，请点击保存', icon: 'success' })
        } catch (err) {
          console.error('上传失败：', err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
      fail: (err) => {
        console.error('选择图片失败：', err)
      }
    })
  },

  // 上传抽奖页面背景图
  chooseLotteryBg() {
    console.log('点击选择抽奖页面背景')
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        console.log('选择图片成功', res.tempFilePaths[0])
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `pageLayout/lottery_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: res.tempFilePaths[0] })
          console.log('上传成功，fileID：', uploadRes.fileID)
          this.setData({ lotteryBg: uploadRes.fileID })
          wx.showToast({ title: '上传成功，请点击保存', icon: 'success' })
        } catch (err) {
          console.error('上传失败：', err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
      fail: (err) => {
        console.error('选择图片失败：', err)
      }
    })
  },

  // 上传开始页宣传弹窗图片
  chooseStartPopupImage() {
    console.log('点击选择开始页宣传弹窗图片')
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        console.log('选择图片成功', res.tempFilePaths[0])
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `pageLayout/startPopup_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: res.tempFilePaths[0] })
          console.log('上传成功，fileID：', uploadRes.fileID)
          this.setData({ startPopupImage: uploadRes.fileID })
          wx.showToast({ title: '上传成功，请点击保存', icon: 'success' })
        } catch (err) {
          console.error('上传失败：', err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
      fail: (err) => {
        console.error('选择图片失败：', err)
      }
    })
  },

  // 上传结算成功弹窗图片
  chooseRewardPopupImage() {
    console.log('点击选择结算成功弹窗图片')
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        console.log('选择图片成功', res.tempFilePaths[0])
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `pageLayout/rewardPopup_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: res.tempFilePaths[0] })
          console.log('上传成功，fileID：', uploadRes.fileID)
          this.setData({ rewardPopupImage: uploadRes.fileID })
          wx.showToast({ title: '上传成功，请点击保存', icon: 'success' })
        } catch (err) {
          console.error('上传失败：', err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
      fail: (err) => {
        console.error('选择图片失败：', err)
      }
    })
  },

  removeStartBg() {
    console.log('移除开始页面背景')
    this.setData({ startBg: '' })
    wx.showToast({ title: '已移除，请点击保存', icon: 'success' })
  },

  removeLotteryBg() {
    console.log('移除抽奖页面背景')
    this.setData({ lotteryBg: '' })
    wx.showToast({ title: '已移除，请点击保存', icon: 'success' })
  },

  removeStartPopupImage() {
    this.setData({ startPopupImage: '' })
    wx.showToast({ title: '已移除，请点击保存', icon: 'success' })
  },

  removeRewardPopupImage() {
    this.setData({ rewardPopupImage: '' })
    wx.showToast({ title: '已移除，请点击保存', icon: 'success' })
  },

  // 添加轮播广告图
  addCarouselImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = `pageLayout/carousel_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: res.tempFilePaths[0] })
          const carouselImages = [...this.data.carouselImages, uploadRes.fileID]
          this.setData({ carouselImages })
          wx.showToast({ title: '上传成功，请点击保存', icon: 'success' })
        } catch (err) {
          console.error('上传失败：', err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 删除轮播广告图
  removeCarouselImage(e) {
    const index = e.currentTarget.dataset.index
    const carouselImages = [...this.data.carouselImages]
    carouselImages.splice(index, 1)
    this.setData({ carouselImages })
    wx.showToast({ title: '已移除，请点击保存', icon: 'success' })
  },

  async saveLayout() {
    console.log('=== saveLayout 开始执行 ===')
    console.log('当前 startBg：', this.data.startBg)
    console.log('当前 lotteryBg：', this.data.lotteryBg)
    console.log('当前 startPopupImage：', this.data.startPopupImage)
    console.log('当前 rewardPopupImage：', this.data.rewardPopupImage)
    
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    
    try {
      console.log('调用云函数 updateLayout...')
      const res = await wx.cloud.callFunction({
        name: 'updateLayout',
        data: {
          startBg: this.data.startBg,
          lotteryBg: this.data.lotteryBg,
          startPopupImage: this.data.startPopupImage,
          rewardPopupImage: this.data.rewardPopupImage,
          carouselImages: this.data.carouselImages
        }
      })
      
      console.log('云函数返回结果：', res)
      
      if (res.result.code === 0) {
        console.log('保存成功')
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        console.error('保存失败，code 不为 0：', res.result)
        throw new Error(res.result.message || '保存失败')
      }
    } catch (err) {
      console.error('保存失败详细错误：', err)
      wx.showToast({ title: '保存失败：' + (err.message || '未知错误'), icon: 'none' })
    } finally {
      console.log('保存结束，隐藏 loading')
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