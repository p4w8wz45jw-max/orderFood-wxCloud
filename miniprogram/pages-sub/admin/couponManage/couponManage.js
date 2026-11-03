// pages-sub/admin/couponManage/couponManage.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    activeTab: 0,
    couponList: [],
    packageList: [],
    showModal: false,
    isEdit: false,
    editId: null,
    couponTypes: ['满减券', '折扣券', '商品券'],
    typeMap: {
      '满减券': 'full_reduction',
      '折扣券': 'discount',
      '商品券': 'product'
    },
    dishList: [],
    formData: {
      name: '',
      type: 'full_reduction',
      typeIndex: 0,
      condition: '',
      value: '',
      discount: '',
      expireDays: 30,
      enable: true,
      productId: '',
      productName: ''
    },
    showPackageModal: false,
    isEditPackage: false,
    editPackageId: null,
    packageForm: {
      name: '',
      price: 0,
      couponId: '',
      couponName: '',
      couponCount: 1,
      expireDays: 30,
      enable: true
    },
    themeColor: '#e54d42'
  },

  onLoad() {
    this.setThemeColor()
    this.loadCoupons()
    this.loadPackages()
    this.loadDishList()
  },

  onShow() {
    this.setThemeColor()
    if (this.data.activeTab === 0) {
      this.loadCoupons()
    } else {
      this.loadPackages()
    }
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  switchTab(e) {
    const tab = parseInt(e.currentTarget.dataset.tab)
    this.setData({ activeTab: tab })
    if (tab === 0) {
      this.loadCoupons()
    } else {
      this.loadPackages()
    }
  },

  async loadCoupons() {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'coupon' }
      })
      const result = res.result || {}
      const allList = result.success ? (result.data || []) : []
      console.log('[loadCoupons] 获取数量:', allList.length)
      this.setData({ couponList: allList })
    } catch (err) {
      console.error('[loadCoupons] 失败:', err)
    } finally {
      wx.hideLoading()
    }
  },

  async loadPackages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'ticket_packages' }
      })
      const result = res.result || {}
      const allList = result.success ? (result.data || []) : []
      this.setData({ packageList: allList })
    } catch (err) {
      console.error('[loadPackages] 失败:', err)
    }
  },

  async loadDishList() {
    // 用云函数绕过客户端20条限制
    wx.showLoading({ title: '加载菜品' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'dish' }
      })
      const result = res.result || {}
      const allDishes = result.success ? (result.data || []) : []
      console.log('[loadDishList] 获取数量:', allDishes.length)
      this.setData({ dishList: allDishes })
    } catch (err) {
      console.error('[loadDishList] 失败:', err)
    } finally {
      wx.hideLoading()
    }
  },

  // ========== 优惠券管理 ==========
  addCoupon() {
    this.setData({
      showModal: true,
      isEdit: false,
      editId: null,
      formData: {
        name: '',
        type: 'full_reduction',
        typeIndex: 0,
        condition: '',
        value: '',
        discount: '',
        expireDays: 30,
        enable: true,
        productId: '',
        productName: ''
      }
    })
  },

  editCoupon(e) {
    const id = e.currentTarget.dataset.id
    const coupon = this.data.couponList.find(c => c._id === id)
    if (!coupon) return
    let typeIndex = 0
    if (coupon.type === 'discount') typeIndex = 1
    if (coupon.type === 'product') typeIndex = 2
    this.setData({
      showModal: true,
      isEdit: true,
      editId: id,
      formData: {
        name: coupon.name || '',
        type: coupon.type || 'full_reduction',
        typeIndex: typeIndex,
        condition: coupon.condition !== undefined ? String(coupon.condition) : '',
        value: coupon.value !== undefined ? String(coupon.value) : '',
        discount: coupon.discount !== undefined ? String(coupon.discount) : '',
        expireDays: coupon.expireDays || 30,
        enable: coupon.enable !== false,
        productId: coupon.productId || '',
        productName: coupon.productName || ''
      }
    })
  },

  async deleteCoupon(e) {
    const id = e.currentTarget.dataset.id
    if (!id) { wx.showToast({ title: '数据异常，无法删除', icon: 'none' }); return }
    wx.showModal({
      title: '确认删除',
      content: '删除后已领取的优惠券可能失效，确定吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' })
          try {
            console.log('[deleteCoupon] 直接删除, id=', id)
            await db.collection('coupon').doc(id).remove()
            wx.hideLoading()
            const couponList = this.data.couponList.filter(c => c._id !== id)
            this.setData({ couponList })
            wx.showToast({ title: '删除成功', icon: 'success' })
          } catch (err) {
            wx.hideLoading()
            console.error('[deleteCoupon] 失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 优惠券表单输入处理方法（使用详细路径更新）
  onNameInput(e) {
    this.setData({ 'formData.name': e.detail.value })
  },
  onTypeChange(e) {
    const idx = parseInt(e.detail.value)
    const typeName = this.data.couponTypes[idx]
    const type = this.data.typeMap[typeName]
    this.setData({
      'formData.typeIndex': idx,
      'formData.type': type
    })
  },
  onConditionInput(e) {
    this.setData({ 'formData.condition': e.detail.value })
  },
  onValueInput(e) {
    this.setData({ 'formData.value': e.detail.value })
  },
  onDiscountInput(e) {
    let val = parseFloat(e.detail.value)
    if (val > 1) val = val / 10
    this.setData({ 'formData.discount': val || 0 })
  },
  onExpireDaysInput(e) {
    const val = parseInt(e.detail.value)
    this.setData({ 'formData.expireDays': isNaN(val) ? '' : val })
  },
  onEnableChange(e) {
    this.setData({ 'formData.enable': e.detail.value })
  },
  onProductChange(e) {
    const idx = e.detail.value
    const dish = this.data.dishList[idx]
    if (dish) {
      this.setData({
        'formData.productId': dish._id,
        'formData.productName': dish.name
      })
    }
  },

  async saveCoupon() {
    console.log('=== saveCoupon 被调用 ===')
    const { formData, isEdit, editId } = this.data
    if (!formData.name) { wx.showToast({ title: '请输入优惠券名称', icon: 'none' }); return }
    if (formData.type === 'full_reduction') {
      if (!formData.condition || !formData.value) { wx.showToast({ title: '请填写满减条件', icon: 'none' }); return }
    }
    if (formData.type === 'discount') {
      if (!formData.discount || formData.discount <= 0) { wx.showToast({ title: '请填写折扣', icon: 'none' }); return }
    }
    if (formData.type === 'product') {
      if (!formData.productId) { wx.showToast({ title: '请选择菜品', icon: 'none' }); return }
    }
    if (!formData.expireDays) { wx.showToast({ title: '请填写有效期', icon: 'none' }); return }

    const data = {
      name: formData.name,
      type: formData.type,
      expireDays: formData.expireDays,
      enable: formData.enable,
      updateTime: new Date()
    }
    if (formData.type === 'full_reduction') {
      data.condition = parseFloat(formData.condition)
      data.value = parseFloat(formData.value)
    } else if (formData.type === 'discount') {
      data.discount = parseFloat(formData.discount)
    } else if (formData.type === 'product') {
      data.productId = formData.productId
      data.productName = formData.productName
    }

    wx.showLoading({ title: '保存中' })
    try {
      let savedId
      if (isEdit) {
        console.log('[saveCoupon] 直接更新数据库, id=', editId, 'data=', JSON.stringify(data))
        await db.collection('coupon').doc(editId).update({ data })
        savedId = editId
        console.log('[saveCoupon] 更新成功')
      } else {
        console.log('[saveCoupon] 直接新增到数据库, data=', JSON.stringify(data))
        const addRes = await db.collection('coupon').add({ data })
        savedId = addRes._id
        console.log('[saveCoupon] 新增成功, _id=', savedId)
      }
      wx.hideLoading()
      // 本地更新列表
      let couponList = this.data.couponList
      const savedItem = { ...data, _id: savedId }
      if (isEdit) {
        couponList = couponList.map(c => c._id === editId ? { ...c, ...savedItem } : c)
      } else {
        couponList = [savedItem, ...couponList]
      }
      this.setData({ couponList, showModal: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('[saveCoupon] 失败:', err)
      wx.showToast({ title: '保存失败：' + (err.message || err.errMsg || ''), icon: 'none', duration: 3000 })
    }
  },

  closeModal() {
    this.setData({ showModal: false })
  },

  // ========== 套票管理 ==========
  addPackage() {
    this.setData({
      showPackageModal: true,
      isEditPackage: false,
      editPackageId: null,
      packageForm: {
        name: '',
        price: 0,
        couponId: '',
        couponName: '',
        couponCount: 1,
        expireDays: 30,
        enable: true
      }
    })
  },

  editPackage(e) {
    const id = e.currentTarget.dataset.id
    const pkg = this.data.packageList.find(p => p._id === id)
    if (!pkg) return
    this.setData({
      showPackageModal: true,
      isEditPackage: true,
      editPackageId: id,
      packageForm: {
        name: pkg.name || '',
        price: pkg.price || 0,
        couponId: pkg.couponId || '',
        couponName: pkg.couponName || '',
        couponCount: pkg.couponCount || 1,
        expireDays: pkg.expireDays || 30,
        enable: pkg.enable !== false
      }
    })
  },

  async deletePackage(e) {
    const id = e.currentTarget.dataset.id
    if (!id) { wx.showToast({ title: '数据异常，无法删除', icon: 'none' }); return }
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' })
          try {
            console.log('[deletePackage] 直接删除, id=', id)
            await db.collection('ticket_packages').doc(id).remove()
            // 先隐藏loading，本地移除列表项，避免二次 showLoading 与 toast 冲突
            wx.hideLoading()
            const packageList = this.data.packageList.filter(p => p._id !== id)
            this.setData({ packageList })
            wx.showToast({ title: '删除成功', icon: 'success' })
          } catch (err) {
            wx.hideLoading()
            console.error(err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  onPackageNameInput(e) { this.setData({ 'packageForm.name': e.detail.value }) },
  onPackagePriceInput(e) {
    const val = e.detail.value
    this.setData({ 'packageForm.price': val === '' ? '' : parseFloat(val) })
  },
  onPackageCouponChange(e) {
    const idx = e.detail.value
    const coupon = this.data.couponList[idx]
    if (coupon) {
      this.setData({
        'packageForm.couponId': coupon._id,
        'packageForm.couponName': coupon.name
      })
    }
  },
  onPackageCountInput(e) { this.setData({ 'packageForm.couponCount': parseInt(e.detail.value) || 1 }) },
  onPackageExpireDaysInput(e) {
    const val = parseInt(e.detail.value)
    this.setData({ 'packageForm.expireDays': isNaN(val) ? '' : val })
  },
  onPackageEnableChange(e) { this.setData({ 'packageForm.enable': e.detail.value }) },

  async savePackage() {
    console.log('=== savePackage 被调用 ===')
    const { packageForm, isEditPackage, editPackageId } = this.data
    if (!packageForm.name) { wx.showToast({ title: '请输入套票名称', icon: 'none' }); return }
    if (!packageForm.price || packageForm.price <= 0) { wx.showToast({ title: '请输入正确的价格', icon: 'none' }); return }
    if (!packageForm.couponId) { wx.showToast({ title: '请选择优惠券', icon: 'none' }); return }
    if (!packageForm.couponCount || packageForm.couponCount <= 0) { wx.showToast({ title: '请输入正确的张数', icon: 'none' }); return }

    const data = {
      name: packageForm.name,
      price: packageForm.price,
      couponId: packageForm.couponId,
      couponName: packageForm.couponName,
      couponCount: packageForm.couponCount,
      expireDays: packageForm.expireDays,
      enable: packageForm.enable,
      updateTime: new Date()
    }

    wx.showLoading({ title: '保存中' })
    try {
      let savedId
      if (isEditPackage) {
        console.log('[savePackage] 直接更新, id=', editPackageId)
        await db.collection('ticket_packages').doc(editPackageId).update({ data })
        savedId = editPackageId
      } else {
        console.log('[savePackage] 直接新增, data=', JSON.stringify(data))
        const addRes = await db.collection('ticket_packages').add({ data })
        savedId = addRes._id
        console.log('[savePackage] 新增成功, _id=', savedId)
      }
      wx.hideLoading()
      let packageList = this.data.packageList
      const savedItem = { ...data, _id: savedId }
      if (isEditPackage) {
        packageList = packageList.map(p => p._id === editPackageId ? { ...p, ...savedItem } : p)
      } else {
        packageList = [savedItem, ...packageList]
      }
      this.setData({ packageList, showPackageModal: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('[savePackage] 失败:', err)
      wx.showToast({ title: '保存失败：' + (err.message || err.errMsg || ''), icon: 'none', duration: 3000 })
    }
  },

  closePackageModal() { this.setData({ showPackageModal: false }) },
  stopPropagation() {},
  noop() {},

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})