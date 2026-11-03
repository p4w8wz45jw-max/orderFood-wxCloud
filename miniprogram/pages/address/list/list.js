const addressUtil = require('../../../utils/address.js')

Page({
  data: {
    addresses: [],
    selectMode: false
  },

  onLoad(options) {
    if (options.from === 'select' || options.from === 'settle') {
      this.setData({ selectMode: true })
      wx.setNavigationBarTitle({ title: '选择收货地址' })
    }
  },

  onShow() {
    this.loadAddresses()
  },

  loadAddresses() {
    this.setData({ addresses: addressUtil.getAddresses() })
  },

  onSelectAddress(e) {
    if (!this.data.selectMode) return
    const address = e.currentTarget.dataset.address
    // 回传给结算页
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.onAddressSelected) {
      prevPage.onAddressSelected(address)
    }
    wx.navigateBack()
  },

  setDefault(e) {
    const id = e.currentTarget.dataset.id
    addressUtil.setDefault(id)
    this.loadAddresses()
    wx.showToast({ title: '已设为默认', icon: 'success' })
  },

  deleteAddress(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '提示',
      content: '确定删除该地址吗？',
      success: res => {
        if (res.confirm) {
          addressUtil.deleteAddress(id)
          this.loadAddresses()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  addAddress() {
    wx.navigateTo({ url: '/pages/address/edit/edit' })
  },

  editAddress(e) {
    const address = e.currentTarget.dataset.address
    wx.navigateTo({
      url: `/pages/address/edit/edit?address=${encodeURIComponent(JSON.stringify(address))}`
    })
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ title: '订单列表 - 餐饮点餐', path: '/pages/order/list' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ title: '订单列表 - 餐饮点餐' })
  }
})