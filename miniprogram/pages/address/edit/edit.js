const addressUtil = require('../../../utils/address.js')

Page({
  data: {
    isEdit: false,
    addressId: '',
    name: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',            // 详细地址（门牌号/楼层）
    locationName: '',      // 地图选点的位置名称
    latitude: null,
    longitude: null,
    isDefault: false
  },

  onLoad(options) {
    if (options.address) {
      const addr = JSON.parse(decodeURIComponent(options.address))
      this.setData({
        isEdit: true,
        addressId: addr._id,
        name: addr.name,
        phone: addr.phone,
        province: addr.province || '',
        city: addr.city || '',
        district: addr.district || '',
        detail: addr.detail || '',
        locationName: addr.locationName || '',
        latitude: addr.latitude || null,
        longitude: addr.longitude || null,
        isDefault: addr.isDefault
      })
    }
  },

  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },
  onDetailInput(e) { this.setData({ detail: e.detail.value }) },
  onDefaultChange(e) { this.setData({ isDefault: e.detail.value }) },

  // 选择位置（调用微信地图）
  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        console.log('选择的位置：', res)
        // 自动将地址填写到详细地址，如果用户已手动输入则不覆盖
        const currentDetail = this.data.detail
        this.setData({
          locationName: res.name,
          latitude: res.latitude,
          longitude: res.longitude,
          detail: currentDetail || res.address || res.name,
          province: '',
          city: '',
          district: ''
        })
      },
      fail: (err) => {
        if (err.errMsg !== 'chooseLocation:fail cancel') {
          wx.showToast({ title: '获取位置失败', icon: 'none' })
        }
      }
    })
  },

  saveAddress() {
    const { name, phone, detail, locationName, latitude, longitude, isDefault, isEdit, addressId } = this.data

    if (!name || !phone || !detail) {
      wx.showToast({ title: '请填写姓名、手机号和详细地址', icon: 'none' })
      return
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式错误', icon: 'none' })
      return
    }
    if (!locationName || !latitude || !longitude) {
      wx.showToast({ title: '请先选择位置', icon: 'none' })
      return
    }

    const addressData = {
      name,
      phone,
      detail,
      locationName,
      latitude,
      longitude,
      isDefault
    }

    if (isEdit) {
      addressUtil.updateAddress(addressId, addressData)
      wx.showToast({ title: '修改成功', icon: 'success' })
    } else {
      addressUtil.addAddress(addressData)
      wx.showToast({ title: '添加成功', icon: 'success' })
    }
    setTimeout(() => wx.navigateBack(), 1500)
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ title: '编辑订单 - 餐饮点餐', path: '/pages/order/edit' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ title: '编辑订单 - 餐饮点餐' })
  }
})