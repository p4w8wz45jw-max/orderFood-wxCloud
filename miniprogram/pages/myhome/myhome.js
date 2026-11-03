// pages/myhome/myhome.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: null,
    showAuthModal: false,
    clickCount: 0,
    clickTimer: null,
    showPasswordModal: false,
    adminPassword: '',
    isFirstTime: false,
    version: '',
    noticeText: '',
    themeColor: '#B8956E',
    points: 0,
    showBalanceDetail: false,
    balanceHistory: [],
    balanceDetailLoading: false,
    showServiceModal: false,
    serviceQrcode: '',
    servicePhone: ''
  },

  onLoad() {
    this.setThemeColor()
    this.loadUserInfo()
    this.getVersion()
    this.loadNotices()
    this.loadPoints()
  },

  onShow() {
    this.setThemeColor()
    this.loadUserInfo()
    this.loadNotices()
    this.loadPoints()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor: themeColor })
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadUserInfo() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({ _openid: openid }).get()
      if (res.data.length) {
        const user = res.data[0]
        if (typeof user.balance === 'undefined') {
          await db.collection('user').doc(user._id).update({ data: { balance: 0 } })
          user.balance = 0
        }
        this.setData({ userInfo: user })
        app.globalData.userInfo = user
        try { wx.setStorageSync('userInfo', user) } catch (_) {}
      } else {
        // 数据库中无记录时，尝试从本地缓存恢复
        try {
          const cached = wx.getStorageSync('userInfo')
          if (cached && cached.phoneNumber) {
            this.setData({ userInfo: cached })
            app.globalData.userInfo = cached
          }
        } catch (_) {}
      }
    } catch (err) { console.error(err) }
  },

  async loadPoints() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const res = await db.collection('user').where({ _openid: openid }).get()
      if (res.data.length) {
        this.setData({ points: res.data[0].points || 0 })
      }
    } catch (err) { console.error(err) }
  },

  async loadNotices() {
    try {
      const res = await db.collection('notice')
        .where({ status: 1 })
        .orderBy('sort', 'asc')
        .limit(10)
        .get()
      const noticeText = res.data.map(item => item.content).join('    ')
      this.setData({ noticeText })
    } catch (err) { console.error(err) }
  },

  handleUserLogin() {
    this.setData({ showAuthModal: true })
  },
  showAuthModal() { this.setData({ showAuthModal: true }) },
  onUserInfoSaved(e) {
    // 用授权组件返回的数据更新 userInfo 和全局数据
    const detail = e.detail || {}
    if (detail.cancelled) {
      this.setData({ showAuthModal: false })
      return
    }
    if (detail.phoneNumber || detail.nickName || detail.avatarUrl) {
      const userInfo = {
        ...(this.data.userInfo || {}),
        ...detail,
      }
      this.setData({ userInfo })
      app.globalData.userInfo = userInfo
      try { wx.setStorageSync('userInfo', userInfo) } catch (_) {}
    }
    this.setData({ showAuthModal: false })
    this.loadPoints()
  },

  goToDiy() {
    if (!this.data.userInfo?.phoneNumber) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/diy/diy' })
  },
  goToCoupon() { wx.navigateTo({ url: '/pages/coupon/coupon' }) },
  goToCouponCenter() { wx.navigateTo({ url: '/pages/couponCenter/couponCenter' }) },
  goToLottery() { wx.navigateTo({ url: '/pages/lottery/lottery' }) },
  goToSeckill() { wx.navigateTo({ url: '/pages/seckill/seckill' }) },
  goToOrder() { wx.switchTab({ url: '/pages/myorder/myorder' }) },
  goToPointMall() { wx.navigateTo({ url: '/pages/pointMall/pointMall' }) },
  goToInvite() { wx.navigateTo({ url: '/pages/invite/invite' }) },
  contactService() {
    this.loadServiceInfo()
  },

  async loadServiceInfo() {
    try {
      wx.showLoading({ title: '加载中...' })
      const res = await db.collection('shopinfo').limit(1).get()
      wx.hideLoading()
      if (res.data && res.data.length > 0) {
        const shop = res.data[0]
        this.setData({
          showServiceModal: true,
          serviceQrcode: shop.serviceQrcode || '',
          servicePhone: shop.servicePhone || shop.contactPhone || ''
        })
      } else {
        this.setData({
          showServiceModal: true,
          serviceQrcode: '',
          servicePhone: ''
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('加载客服信息失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  closeServiceModal() {
    this.setData({ showServiceModal: false })
  },

  callServicePhone() {
    const phone = this.data.servicePhone
    if (!phone) {
      wx.showToast({ title: '暂无客服电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onAdminTrigger() {
    this.data.clickCount++
    if (this.data.clickTimer) clearTimeout(this.data.clickTimer)
    if (this.data.clickCount >= 5) {
      this.data.clickCount = 0
      this.checkAdminFirstTime()
    } else {
      this.data.clickTimer = setTimeout(() => { this.data.clickCount = 0 }, 1000)
    }
  },

  async checkAdminFirstTime() {
    try {
      wx.showLoading({ title: '检查中...' })
      const res = await db.collection('admin').get()
      wx.hideLoading()
      this.setData({ showPasswordModal: true, isFirstTime: res.data.length === 0, adminPassword: '' })
    } catch (err) {
      wx.hideLoading()
      this.setData({ showPasswordModal: true, isFirstTime: true, adminPassword: '' })
    }
  },

  closePasswordModal() { this.setData({ showPasswordModal: false, adminPassword: '' }) },
  noop() {},
  stopPropagation() {},
  onPasswordInput(e) { this.setData({ adminPassword: e.detail.value }) },

  async verifyPassword() {
    const password = this.data.adminPassword.trim()
    if (!password) return wx.showToast({ title: '请输入密码', icon: 'none' })
    if (password.length < 6) return wx.showToast({ title: '密码长度不能少于6位', icon: 'none' })
    try {
      wx.showLoading({ title: this.data.isFirstTime ? '设置中...' : '验证中...' })
      const res = await db.collection('admin').limit(1).get()
      if (this.data.isFirstTime) {
        if (res.data.length) {
          wx.hideLoading()
          wx.showToast({ title: '管理员已存在', icon: 'none' })
          this.setData({ isFirstTime: false, adminPassword: '' })
          return
        }
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'admin', data: { password, createTime: new Date(), updateTime: new Date() } }
        })
        wx.hideLoading()
        wx.showToast({ title: '密码设置成功', icon: 'success' })
        wx.navigateTo({ url: '/pages-sub/admin/admin' })
        this.closePasswordModal()
      } else {
        wx.hideLoading()
        if (res.data.length === 0 || res.data[0].password !== password) {
          wx.showToast({ title: '密码错误', icon: 'none' })
          return
        }
        wx.navigateTo({ url: '/pages-sub/admin/admin' })
        this.closePasswordModal()
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },

  getVersion() {
    const accountInfo = wx.getAccountInfoSync()
    this.setData({ version: accountInfo.miniProgram.version || '1.0.0' })
  },

  // 查看余额明细
  async showBalanceDetail() {
    if (!this.data.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    this.setData({
      showBalanceDetail: true,
      balanceHistory: [],
      balanceDetailLoading: true
    })
    await this.loadBalanceHistory()
  },

  // 关闭余额明细
  closeBalanceDetail() {
    this.setData({
      showBalanceDetail: false,
      balanceHistory: []
    })
  },

  // 加载余额变动历史
  async loadBalanceHistory() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const history = []

      // 1. 查询余额变动日志（含管理员调整、退款等）
      try {
        const logRes = await db.collection('balance_log')
          .where({ _openid: openid })
          .orderBy('createTime', 'desc')
          .limit(100)
          .get()
        if (logRes.data && logRes.data.length > 0) {
          logRes.data.forEach(log => {
            const desc = log.description || (log.type === 'refund'
              ? `订单退款 +¥${(log.amount || 0).toFixed(2)}`
              : (log.amount > 0 ? `余额变动 +¥${log.amount.toFixed(2)}` : `余额变动 -¥${Math.abs(log.amount || 0).toFixed(2)}`))
            history.push({
              id: log._id,
              type: log.type || 'balance',
              amount: log.amount || 0,
              date: this.formatBalanceTime(log.createTime),
              description: desc,
              isIncome: (log.amount || 0) > 0,
              rawTime: log.createTime
            })
          })
        }
      } catch (err) { console.error('加载balance_log失败', err) }

      // 2. 查询充值记录（兼容 pay_status 和 payStatus 两种字段名）
      try {
        const _ = db.command
        const rechargeRes = await db.collection('order')
          .where(_.and([
            { _openid: openid },
            { type: 'recharge' },
            _.or([{ payStatus: true }, { pay_status: true }])
          ]))
          .orderBy('createTime', 'desc')
          .limit(100)
          .get()
        if (rechargeRes.data && rechargeRes.data.length > 0) {
          rechargeRes.data.forEach(order => {
            const totalGet = order.totalGet || (order.amount + (order.giveAmount || 0))
            history.push({
              id: order._id,
              type: 'recharge',
              amount: totalGet,
              date: this.formatBalanceTime(order.createTime),
              description: `在线充值 +¥${totalGet.toFixed(2)}${order.giveAmount ? ` (含赠¥${order.giveAmount})` : ''}`,
              isIncome: true,
              rawTime: order.createTime
            })
          })
        }
      } catch (err) { console.error('加载充值记录失败', err) }

      // 3. 查询消费订单（余额支付部分）
      try {
        const _ = db.command
        const orderRes = await db.collection('order')
          .where(_.and([
            { _openid: openid },
            { type: _.or([_.exists(false), _.neq('recharge')]) },
            _.or([{ payStatus: true }, { pay_status: true }])
          ]))
          .orderBy('createTime', 'desc')
          .limit(100)
          .get()
        if (orderRes.data && orderRes.data.length > 0) {
          orderRes.data.forEach(order => {
            const balancePaid = order.balancePaid || 0
            if (balancePaid > 0) {
              history.push({
                id: order._id,
                type: 'order_pay',
                amount: -balancePaid,
                date: this.formatBalanceTime(order.createTime),
                description: `点餐消费 -¥${balancePaid.toFixed(2)}`,
                isIncome: false,
                rawTime: order.createTime
              })
            }
          })
        }
      } catch (err) { console.error('加载消费记录失败', err) }

      // 按时间倒序排列
      history.sort((a, b) => {
        const t1 = a.rawTime ? new Date(a.rawTime).getTime() : 0
        const t2 = b.rawTime ? new Date(b.rawTime).getTime() : 0
        return t2 - t1
      })

      this.setData({
        balanceHistory: history,
        balanceDetailLoading: false
      })
    } catch (err) {
      console.error('加载余额明细失败', err)
      this.setData({ balanceDetailLoading: false })
    }
  },

  formatBalanceTime(date) {
    if (!date) return '未知'
    const d = new Date(date)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}`
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '我的 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/myhome/myhome' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '我的 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})