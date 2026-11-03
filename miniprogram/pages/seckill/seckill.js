// pages/seckill/seckill.js
const app = getApp()

Page({
  data: {
    seckillList: [],
    loading: true,
    themeColor: '#B8956E',
    userInfo: null
  },

  onLoad() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  onShow() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
    this.loadUserInfo()
    this.loadSeckillList()
    this.startCountdown()
  },

  onHide() {
    this.stopCountdown()
  },

  onUnload() {
    this.stopCountdown()
  },

  startCountdown() {
    this.stopCountdown()
    this._timer = setInterval(() => {
      this.updateCountdown()
    }, 1000)
  },

  stopCountdown() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  async loadUserInfo() {
    try {
      const userInfo = app.globalData.userInfo
      if (userInfo && userInfo.phoneNumber) {
        this.setData({ userInfo })
        return
      }
      const cached = wx.getStorageSync('userInfo')
      if (cached && cached.phoneNumber) {
        this.setData({ userInfo: cached })
      }
    } catch (_) {}
  },

  async loadSeckillList() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'find', collection: 'seckill' }
      })
      let list = (res.result && res.result.success && res.result.data) ? res.result.data : []
      // 只显示启用的
      list = list.filter(item => item.enable !== false)
      
      const now = new Date()
      // 标记状态
      list = list.map(item => {
        const startTime = new Date(item.startTime)
        const endTime = new Date(item.endTime)
        let status = 'upcoming'
        if (now > endTime) status = 'ended'
        else if (now >= startTime && now <= endTime) {
          if ((item.soldCount || 0) >= (item.stock || 0)) status = 'soldout'
          else status = 'active'
        }
        // 预计算倒计时和格式化时间
        const countdown = this.calcCountdown(item, status, now)
        return { ...item, _status: status, _countdown: countdown, _countdownText: this.formatCountdownText(countdown), _startTimeText: this.formatDisplayTime(item.startTime), _endTimeText: this.formatDisplayTime(item.endTime) }
      })

      // 排序：进行中 > 即将开始 > 已结束
      const orderMap = { active: 0, upcoming: 1, soldout: 2, ended: 3 }
      list.sort((a, b) => (orderMap[a._status] || 99) - (orderMap[b._status] || 99))

      this.setData({ seckillList: list, loading: false })
    } catch (err) {
      console.error('加载秒杀列表失败', err)
      this.setData({ loading: false })
    }
  },

  // 计算倒计时
  calcCountdown(item, status, now) {
    if (status !== 'upcoming' && status !== 'active') return null
    const baseTime = now || new Date()
    const targetDate = new Date(status === 'upcoming' ? item.startTime : item.endTime)
    if (isNaN(targetDate.getTime())) return null
    let diff = Math.max(0, targetDate.getTime() - baseTime.getTime())
    const days = Math.floor(diff / 86400000)
    diff -= days * 86400000
    const hours = Math.floor(diff / 3600000)
    diff -= hours * 3600000
    const minutes = Math.floor(diff / 60000)
    diff -= minutes * 60000
    const seconds = Math.floor(diff / 1000)
    return { days, hours, minutes, seconds }
  },

  // 每秒更新倒计时
  updateCountdown() {
    const list = this.data.seckillList
    if (!list || list.length === 0) return
    const now = new Date()
    let changed = false
    const newList = list.map(item => {
      const countdown = this.calcCountdown(item, item._status, now)
      if (JSON.stringify(countdown) !== JSON.stringify(item._countdown)) {
        changed = true
        return { ...item, _countdown: countdown, _countdownText: this.formatCountdownText(countdown) }
      }
      return item
    })
    if (changed) {
      this.setData({ seckillList: newList })
    }
  },

  // 格式化时间显示
  formatDisplayTime(str) {
    if (!str) return ''
    const d = new Date(str)
    if (isNaN(d.getTime())) return ''
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  },

  // 格式化倒计时文本
  formatCountdownText(cd) {
    if (!cd) return '00:00:00'
    if (cd.days > 0) {
      return `${cd.days}天 ${String(cd.hours).padStart(2, '0')}:${String(cd.minutes).padStart(2, '0')}:${String(cd.seconds).padStart(2, '0')}`
    }
    return `${String(cd.hours).padStart(2, '0')}:${String(cd.minutes).padStart(2, '0')}:${String(cd.seconds).padStart(2, '0')}`
  },

  async onGrabSeckill(e) {
    const item = e.currentTarget.dataset.item
    const userInfo = this.data.userInfo

    // 检查是否登录
    if (!userInfo || !userInfo.phoneNumber) {
      wx.showToast({ title: '请先登录后再参与秒杀', icon: 'none' })
      return
    }

    // 检查是否可购买
    if (item._status !== 'active') {
      wx.showToast({ title: '该秒杀活动当前不可购买', icon: 'none' })
      return
    }

    // 确认弹窗
    wx.showModal({
      title: '确认秒杀',
      content: `确认以 ¥${item.price} 秒杀【${item.title}】？每人限购一次。`,
      confirmText: '确认秒杀',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '正在下单...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'seckillBuy',
            data: { seckillId: item._id }
          })
          wx.hideLoading()

          if (!result.result || !result.result.success) {
            wx.showToast({ title: result.result?.error || '下单失败', icon: 'none', duration: 2500 })
            return
          }

          // 0元秒杀直接成功
          if (result.result.free) {
            wx.showToast({ title: result.result.message || '秒杀成功', icon: 'success', duration: 2500 })
            this.loadSeckillList()
            return
          }

          // 调起微信支付
          const payment = result.result.payment
          const outTradeNo = result.result.outTradeNo
          wx.requestPayment({
            ...payment,
            success: () => {
              wx.showToast({ title: '支付成功，优惠券已发放', icon: 'success', duration: 2500 })
              this.loadSeckillList()
            },
            fail: async () => {
              // 用户取消或支付失败，回滚库存
              wx.cloud.callFunction({
                name: 'seckillBuy',
                data: { action: 'cancel', outTradeNo: outTradeNo }
              }).catch(err => console.error('取消订单失败', err))
              wx.showToast({ title: '支付已取消', icon: 'none' })
            }
          })
        } catch (err) {
          wx.hideLoading()
          console.error('秒杀失败', err)
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        }
      }
    })
  },

  getStatusText(status) {
    const map = { active: '进行中', upcoming: '即将开始', soldout: '已售罄', ended: '已结束' }
    return map[status] || status
  },

  getStatusClass(status) {
    return 'tag-' + status
  },

  formatTime(str) {
    if (!str) return ''
    const d = new Date(str)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  onShareAppMessage() {
    const list = (this.data.seckillList || []).filter(s => s && s.image)
    const pick = list.find(s => s._status === 'active') || list[0] || null
    if (pick) {
      return require('../../utils/share.js').shareMessage({
        type: 'goods',
        title: (pick.title || '限时秒杀') + ' · 手慢无！',
        path: '/pages/seckill/seckill',
        goods: {
          id: pick._id || pick.id,
          name: pick.title,
          price: pick.price,
          originPrice: pick.originPrice,
          discountText: pick.originPrice && pick.originPrice > pick.price ? '秒杀' : '',
          image: pick.image,
          tags: ['限时', '秒杀']
        }
      })
    }
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '限时秒杀 - 手慢无！', path: '/pages/seckill/seckill' })
  }
})
