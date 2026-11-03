// pages-sub/admin/seckill/seckill.js
const app = getApp()

Page({
  data: {
    seckillList: [],
    showModal: false,
    editingItem: null,
    formTitle: '',
    form: {
      title: '',
      couponId: '',
      imageUrl: '',
      price: 0,
      stock: 0,
      startDate: '',
      endDate: '',
      startTimeStr: '00:00',
      endTimeStr: '23:59',
      enable: true
    },
    couponList: [],
    couponIndex: -1,
    selectedCoupon: null,
    themeColor: '#e54d42'
  },

  onLoad() {
    this.setThemeColor()
  },

  onShow() {
    this.setThemeColor()
    this.loadList()
    this.loadCoupons()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
    this.setData({ themeColor })
  },

  async loadList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'find', collection: 'seckill' }
      })
      const list = (res.result && res.result.success && res.result.data) ? res.result.data : []
      list.sort((a, b) => new Date(b.createTime || 0) - new Date(a.createTime || 0))
      const now = new Date()
      list.forEach(item => {
        const start = new Date(item.startTime)
        const end = new Date(item.endTime)
        if (!item.enable) {
          item._statusText = '已关闭'
          item._statusClass = 'status-disabled'
        } else if (now < start) {
          item._statusText = '未开始'
          item._statusClass = 'status-upcoming'
        } else if (now > end) {
          item._statusText = '已结束'
          item._statusClass = 'status-ended'
        } else if ((item.soldCount || 0) >= (item.stock || 0)) {
          item._statusText = '已售罄'
          item._statusClass = 'status-soldout'
        } else {
          item._statusText = '进行中'
          item._statusClass = 'status-active'
        }
      })
      this.setData({ seckillList: list })
    } catch (err) {
      console.error('加载秒杀列表失败', err)
      wx.showToast({ title: '加载秒杀列表失败，请检查数据库seckill集合是否存在', icon: 'none', duration: 3000 })
    }
  },

  async loadCoupons() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'find', collection: 'coupon' }
      })
      this.setData({ couponList: res.result && res.result.data ? res.result.data : [] })
    } catch (err) {
      console.error('加载优惠券失败', err)
    }
  },

  addSeckill() {
    const now = new Date()
    const defaultStart = new Date(now.getTime() + 3600000)
    const defaultEnd = new Date(now.getTime() + 86400000)
    const pad = n => String(n).padStart(2, '0')
    const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const toTimeStr = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
    this.setData({
      showModal: true,
      editingItem: null,
      formTitle: '新增秒杀活动',
      form: {
        title: '',
        couponId: '',
        imageUrl: '',
        price: '',
        stock: 10,
        startDate: toDateStr(defaultStart),
        endDate: toDateStr(defaultEnd),
        startTimeStr: toTimeStr(defaultStart),
        endTimeStr: toTimeStr(defaultEnd),
        enable: true
      },
      couponIndex: -1,
      selectedCoupon: null
    })
  },

  editSeckill(e) {
    const item = e.currentTarget.dataset.item
    const pad = n => String(n).padStart(2, '0')
    const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const toTimeStr = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
    const startDate = new Date(item.startTime)
    const endDate = new Date(item.endTime)
    this.setData({
      showModal: true,
      editingItem: item,
      formTitle: '编辑秒杀活动',
      form: {
        title: item.title || '',
        couponId: item.couponId || '',
        imageUrl: item.imageUrl || '',
        price: item.price ? String(item.price) : '',
        stock: item.stock || 10,
        startDate: toDateStr(startDate),
        endDate: toDateStr(endDate),
        startTimeStr: toTimeStr(startDate),
        endTimeStr: toTimeStr(endDate),
        enable: item.enable !== false
      },
      selectedCoupon: null
    })
    if (item.couponId && this.data.couponList.length) {
      const idx = this.data.couponList.findIndex(c => c._id === item.couponId)
      this.setData({ couponIndex: idx, selectedCoupon: idx >= 0 ? this.data.couponList[idx] : null })
    }
  },

  onTitleInput(e) { this.setData({ 'form.title': e.detail.value }) },
  onPriceInput(e) { this.setData({ 'form.price': e.detail.value }) },
  onStockInput(e) { this.setData({ 'form.stock': parseInt(e.detail.value) || 0 }) },
  onStartDateChange(e) { this.setData({ 'form.startDate': e.detail.value }) },
  onEndDateChange(e) { this.setData({ 'form.endDate': e.detail.value }) },
  onStartTimeChange(e) { this.setData({ 'form.startTimeStr': e.detail.value }) },
  onEndTimeChange(e) { this.setData({ 'form.endTimeStr': e.detail.value }) },
  onEnableChange(e) { this.setData({ 'form.enable': e.detail.value }) },

  onCouponChange(e) {
    const index = e.detail.value
    const coupon = this.data.couponList[index]
    this.setData({
      couponIndex: index,
      couponId: coupon ? coupon._id : '',
      'form.couponId': coupon ? coupon._id : '',
      selectedCoupon: coupon
    })
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          const result = await wx.cloud.uploadFile({
            cloudPath: `seckill/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
            filePath: tempPath
          })
          this.setData({ 'form.imageUrl': result.fileID })
          wx.hideLoading()
          wx.showToast({ title: '上传成功', icon: 'success' })
        } catch (err) {
          wx.hideLoading()
          console.error('图片上传失败', err)
          wx.showToast({ title: '图片上传失败', icon: 'none' })
        }
      }
    })
  },

  removeImage() {
    this.setData({ 'form.imageUrl': '' })
  },

  closeModal() { this.setData({ showModal: false }) },

  async saveSeckill() {
    const { form, editingItem } = this.data
    if (!form.title.trim()) { wx.showToast({ title: '请输入活动标题', icon: 'none' }); return }
    if (!form.couponId) { wx.showToast({ title: '请选择商品券', icon: 'none' }); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price <= 0) { wx.showToast({ title: '请输入有效秒杀价格', icon: 'none' }); return }
    if (!form.stock || form.stock <= 0) { wx.showToast({ title: '请输入有效库存', icon: 'none' }); return }
    if (!form.startDate || !form.startTimeStr) { wx.showToast({ title: '请选择开始时间', icon: 'none' }); return }
    if (!form.endDate || !form.endTimeStr) { wx.showToast({ title: '请选择结束时间', icon: 'none' }); return }
    const startTime = new Date(`${form.startDate}T${form.startTimeStr}:00`)
    const endTime = new Date(`${form.endDate}T${form.endTimeStr}:00`)
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      wx.showToast({ title: '请选择有效时间', icon: 'none' }); return
    }
    if (endTime <= startTime) { wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' }); return }
    if (endTime <= new Date()) { wx.showToast({ title: '结束时间必须在未来', icon: 'none' }); return }

    wx.showLoading({ title: '保存中...' })
    try {
      const dataToSave = {
        title: form.title.trim(),
        couponId: form.couponId,
        imageUrl: form.imageUrl || '',
        price: price,
        stock: form.stock,
        startTime: startTime,
        endTime: endTime,
        enable: form.enable,
        updateTime: new Date()
      }

      if (editingItem && editingItem._id) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'seckill', docId: editingItem._id, data: dataToSave }
        })
      } else {
        dataToSave.soldCount = 0
        dataToSave.createTime = new Date()
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'seckill', data: dataToSave }
        })
      }

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.closeModal()
      this.loadList()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async toggleEnable(e) {
    const item = e.currentTarget.dataset.item
    const newEnable = !item.enable
    try {
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'seckill', docId: item._id, data: { enable: newEnable, updateTime: new Date() } }
      })
      this.loadList()
    } catch (err) {
      console.error('切换状态失败', err)
    }
  },

  async deleteSeckill(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '确认删除',
      content: `确定删除秒杀活动"${item.title}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({
              name: 'adminSaveData',
              data: { action: 'remove', collection: 'seckill', docId: item._id }
            })
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadList()
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  getStatusText(item) {
    const now = new Date()
    const start = new Date(item.startTime)
    const end = new Date(item.endTime)
    if (!item.enable) return '已关闭'
    if (now < start) return '未开始'
    if (now > end) return '已结束'
    if ((item.soldCount || 0) >= (item.stock || 0)) return '已售罄'
    return '进行中'
  },

  getStatusClass(item) {
    const status = this.getStatusText(item)
    if (status === '进行中') return 'status-active'
    if (status === '未开始') return 'status-upcoming'
    return 'status-ended'
  },

  onShareAppMessage() {
    return { title: '餐饮点餐 - 秒杀活动管理', path: '/pages/index/index' }
  }
})
