// pages-sub/admin/admin.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    showPasswordModal: false,
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    adminTemplateId: '',
    themeColor: '#B8956E',
    useOfficialAccount: false,
    adminId: '',
    mpOpenid: ''
  },

  async onLoad(options) {
    this.setThemeColor()
    this.setData({ themeColor: app.globalData.themeColor || '#B8956E' })
    if (options.changePassword === 'true') {
      setTimeout(() => this.showChangePassword(), 500)
    }
    await this.loadAdminTemplateId()
    await this.loadAdminInfo()
    await this.saveAdminOpenid()
  },

  onShow() {
    this.setThemeColor()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadAdminTemplateId() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data.length && res.data[0].adminPushSettings) {
        const settings = res.data[0].adminPushSettings
        this.setData({
          adminTemplateId: settings.newOrderMsgTemplateId || '',
          useOfficialAccount: !!settings.useOfficialAccount
        })
        console.log('推送设置加载成功:', settings)
      } else {
        console.warn('未找到 adminPushSettings')
      }
    } catch (err) {
      console.error('加载模板ID失败', err)
    }
  },

  async loadAdminInfo() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const adminRes = await db.collection('admin').where({ openid }).get()
      if (adminRes.data.length > 0) {
        const admin = adminRes.data[0]
        this.setData({ adminId: admin._id, mpOpenid: admin.mpOpenid || '' })
      }
    } catch (err) {
      console.error('加载管理员信息失败', err)
    }
  },

  async saveAdminOpenid() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      // 查询所有管理员记录，检查当前 openid 是否已存在
      const adminRes = await db.collection('admin').get()
      const existingAdmin = adminRes.data.find(a => a.openid === openid)
      if (existingAdmin) {
        console.log('当前管理员openid已存在，无需重复保存')
        return
      }
      // 如果有一个缺少 openid 的空记录（旧数据，只有密码），复用它
      const emptyAdmin = adminRes.data.find(a => !a.openid)
      if (emptyAdmin) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'admin', docId: emptyAdmin._id, data: { openid: openid } }
        })
        console.log('管理员openid已更新到已有记录')
        return
      }
      // 创建新的管理员记录
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'add', collection: 'admin', data: { openid: openid, createTime: new Date() } }
      })
      console.log('管理员记录已创建')
    } catch (err) {
      console.error('保存管理员openid失败', err)
    }
  },

  subscribeNewOrder() {
    const templateId = this.data.adminTemplateId
    if (!templateId) {
      wx.showModal({
        title: '未配置模板ID',
        content: '请先前往「店铺设置」中配置订阅消息模板ID',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success(res) {
        if (res[templateId] === 'accept') {
          wx.showToast({ title: '订阅成功！新订单将收到通知', icon: 'success' })
        } else if (res[templateId] === 'reject') {
          wx.showToast({ title: '已拒绝订阅，可在设置中重新开启', icon: 'none', duration: 2500 })
        } else {
          wx.showToast({ title: '已取消', icon: 'none' })
        }
      },
      fail(err) {
        console.error('订阅失败', err)
        const errMsg = err.errMsg || ''
        if (errMsg.includes('main switch')) {
          wx.showModal({
            title: '订阅消息已关闭',
            content: '请在「设置→订阅消息」中开启该小程序的通知权限',
            showCancel: false,
            confirmText: '知道了'
          })
        } else if (errMsg.includes('template')) {
          wx.showToast({ title: '模板ID无效，请检查配置', icon: 'none' })
        } else {
          wx.showToast({ title: '订阅失败，请稍后重试', icon: 'none' })
        }
      }
    })
  },

  goToDish() { wx.navigateTo({ url: '/pages-sub/admin/dish/dish' }) },
  goToUser() { wx.navigateTo({ url: '/pages-sub/admin/user/user' }) },
  goToOrder() { wx.navigateTo({ url: '/pages-sub/admin/order/order' }) },
  goToRechargeOptions() { wx.navigateTo({ url: '/pages-sub/admin/rechargeOptions/rechargeOptions' }) },

  goToPrinter() { wx.navigateTo({ url: '/pages-sub/admin/printer/printer' }) },
  goToShopInfo() { wx.navigateTo({ url: '/pages-sub/admin/shopInfo/shopInfo' }) },
  goToPayConfig() { wx.navigateTo({ url: '/pages-sub/admin/payConfig/payConfig' }) },
  goToRechargeNotice() { wx.navigateTo({ url: '/pages-sub/admin/notice/notice' }) },
  goToDeliveryConfig() { wx.navigateTo({ url: '/pages-sub/admin/deliveryConfig/deliveryConfig' }) },
  goToPageLayout() { wx.navigateTo({ url: '/pages-sub/admin/pageLayout/pageLayout' }) },
  goToLotteryConfig() { wx.navigateTo({ url: '/pages-sub/admin/lotteryConfig/lotteryConfig' }) },
  goToCouponManage() { wx.navigateTo({ url: '/pages-sub/admin/couponManage/couponManage' }) },
  // 新增：积分商城配置
  goToPointsConfig() { wx.navigateTo({ url: '/pages-sub/admin/pointsConfig/pointsConfig' }) },
  // 秒杀活动管理
  goToSeckill() { wx.navigateTo({ url: '/pages-sub/admin/seckill/seckill' }) },
  // 新增：数据统计
  goToStatistics() { wx.navigateTo({ url: '/pages-sub/admin/statistics/statistics' }) },
  // 新增：邀请有奖配置
  goToInviteConfig() { wx.navigateTo({ url: '/pages-sub/admin/inviteConfig/inviteConfig' }) },
  // 新增：DIY菜单配置
  goToDiyConfig() { wx.navigateTo({ url: '/pages-sub/admin/diyConfig/diyConfig' }) },

  showChangePassword() {
    this.setData({ showPasswordModal: true, oldPassword: '', newPassword: '', confirmPassword: '' })
  },
  closePasswordModal() { this.setData({ showPasswordModal: false }) },
  stopPropagation() {},
  onOldPasswordInput(e) { this.setData({ oldPassword: e.detail.value }) },
  onNewPasswordInput(e) { this.setData({ newPassword: e.detail.value }) },
  onConfirmPasswordInput(e) { this.setData({ confirmPassword: e.detail.value }) },
  onMpOpenidInput(e) { this.setData({ mpOpenid: e.detail.value }) },

  async saveMpOpenid() {
    const { adminId, mpOpenid } = this.data
    if (!adminId) {
      wx.showToast({ title: '未找到管理员记录', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'admin', docId: adminId, data: { mpOpenid: mpOpenid.trim() } }
      })
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('保存公众号openid失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async confirmChangePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data
    if (!oldPassword) { wx.showToast({ title: '请输入原密码', icon: 'none' }); return }
    if (!newPassword) { wx.showToast({ title: '请输入新密码', icon: 'none' }); return }
    if (newPassword.length < 6) { wx.showToast({ title: '新密码长度不能少于6位', icon: 'none' }); return }
    if (newPassword !== confirmPassword) { wx.showToast({ title: '两次密码输入不一致', icon: 'none' }); return }
    try {
      wx.showLoading({ title: '修改中...' })
      const res = await db.collection('admin').get()
      if (res.data.length === 0) {
        wx.hideLoading()
        wx.showToast({ title: '管理员不存在', icon: 'none' })
        return
      }
      const admin = res.data[0]
      if (admin.password !== oldPassword) {
        wx.hideLoading()
        wx.showToast({ title: '原密码错误', icon: 'none' })
        return
      }
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'admin', docId: admin._id, data: { password: newPassword, updateTime: new Date() } }
      })
      wx.hideLoading()
      wx.showToast({ title: '密码修改成功', icon: 'success' })
      this.closePasswordModal()
    } catch (err) {
      wx.hideLoading()
      console.error('修改密码失败', err)
      wx.showToast({ title: '修改失败，请重试', icon: 'none' })
    }
  },

  goToNewUserGift() { wx.navigateTo({ url: '/pages-sub/admin/newUserGift/newUserGift' }) },

  goBack() { wx.navigateBack() },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})