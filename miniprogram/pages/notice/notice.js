// pages/notice/notice.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    notices: [],
    rechargeNotice: ''
  },

  onLoad() {
    this.loadNotices()
    this.loadRechargeNotice()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor: themeColor })
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadNotices() {
    try {
      const res = await db.collection('notice')
        .where({ status: 1 })
        .orderBy('sort', 'asc')
        .limit(10)
        .get()
      const noticeText = res.data.map(item => item.content).join('    ')
      this.setData({ notices: res.data, noticeText: noticeText })
    } catch (err) {
      console.error('加载公告失败', err)
    }
  },

  async loadRechargeNotice() {
    try {
      const res = await db.collection('config').doc('config').get()
      this.setData({ rechargeNotice: res.data.rechargeNotice || '' })
    } catch (err) {
      console.error('加载充值说明失败', err)
    }
  },

  onRechargeNoticeInput(e) {
    this.setData({ rechargeNotice: e.detail.value })
  },

  async saveRechargeNotice() {
    wx.showLoading({ title: '保存中...' })
    try {
      await db.collection('config').doc('config').update({
        data: { rechargeNotice: this.data.rechargeNotice, updateTime: db.serverDate() }
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  addNotice() {
    wx.showModal({
      title: '新增公告',
      editable: true,
      placeholderText: '请输入公告内容',
      success: async (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          try {
            await db.collection('notice').add({
              data: {
                content: res.content.trim(),
                status: 1,
                sort: this.data.notices.length,
                createTime: new Date()
              }
            })
            wx.showToast({ title: '添加成功', icon: 'success' })
            this.loadNotices()
          } catch (err) {
            wx.showToast({ title: '添加失败', icon: 'none' })
          }
        }
      }
    })
  },

  deleteNotice(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            await db.collection('notice').doc(id).remove()
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadNotices()
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  toggleStatus(e) {
    const id = e.currentTarget.dataset.id
    const notice = this.data.notices.find(n => n._id === id)
    if (!notice) return
    const newStatus = notice.status === 1 ? 0 : 1
    wx.showModal({
      title: '确认操作',
      content: `确定要${newStatus === 1 ? '启用' : '禁用'}这条公告吗？`,
      success: async (modalRes) => {
        if (modalRes.confirm) {
          try {
            await db.collection('notice').doc(id).update({
              data: { status: newStatus, updateTime: new Date() }
            })
            wx.showToast({ title: newStatus === 1 ? '已启用' : '已禁用', icon: 'success' })
            this.loadNotices()
          } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '店铺公告 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/notice/notice' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '店铺公告 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})