// pages/recharge/recharge.js
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    rechargeList: [],
    userInfo: null,
    showAuthModal: false,
    rechargePage: 0,
    rechargePageSize: 20,
    rechargeHasMore: true,
    loadingRecharge: false,
    pendingRecharge: null,
    themeColor: '#B8956E',
    useMockPay: false,
    selectedRechargeId: null,
    selectedRecharge: null,
    rechargeNotice: ''
  },

  onLoad() {
    this.setThemeColor()
    this.loadRechargeList()
    this.loadUserInfo()
    this.loadRechargeNotice()
  },

  onShow() {
    this.setThemeColor()
    this.loadUserInfo()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor: themeColor })
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  async loadRechargeNotice() {
    try {
      const res = await db.collection('config').doc('config').get()
      this.setData({ rechargeNotice: res.data.rechargeNotice || '' })
      console.log('充值说明加载成功:', this.data.rechargeNotice)
    } catch (err) {
      console.error('加载充值说明失败', err)
      this.setData({ rechargeNotice: '' })
    }
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
      }
    } catch (err) { console.error('获取用户信息失败', err) }
  },

  async loadRechargeList(append = false) {
    if (this.data.loadingRecharge) return
    if (!append) wx.showLoading({ title: '加载中...' })
    this.setData({ loadingRecharge: true })
    try {
      const pageSize = this.data.rechargePageSize
      const page = append ? this.data.rechargePage + 1 : 0
      const skip = page * pageSize
      const res = await db.collection('rechargeOptions')
        .where({ status: 1 })
        .orderBy('amount', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()
      const list = res.data || []
      const newList = append ? this.data.rechargeList.concat(list) : list
      const hasMore = list.length === pageSize
      this.setData({
        rechargeList: newList,
        rechargePage: page,
        rechargeHasMore: hasMore
      })
      if (!this.data.selectedRecharge && newList.length > 0) {
        this.setData({
          selectedRechargeId: newList[0]._id,
          selectedRecharge: newList[0]
        })
      }
    } catch (err) {
      console.error('加载充值套餐失败', err)
      if (!append) wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (!append) wx.hideLoading()
      this.setData({ loadingRecharge: false })
    }
  },

  onReachBottom() {
    if (this.data.rechargeHasMore && !this.data.loadingRecharge) {
      this.loadRechargeList(true)
    }
  },

  selectRecharge(e) {
    const recharge = e.currentTarget.dataset.recharge
    this.setData({
      selectedRechargeId: recharge._id,
      selectedRecharge: recharge
    })
  },

  confirmRecharge() {
    const { selectedRecharge, userInfo } = this.data
    if (!selectedRecharge) {
      wx.showToast({ title: '请选择充值套餐', icon: 'none' })
      return
    }
    const recharge = selectedRecharge
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      this.setData({ showAuthModal: true, pendingRecharge: recharge })
      return
    }
    const totalGet = recharge.amount + (recharge.giveAmount || 0)
    wx.showModal({
      title: '确认充值',
      content: `充值¥${recharge.amount}，赠送¥${recharge.giveAmount || 0}，共到账¥${totalGet}`,
      success: async (res) => {
        if (res.confirm) await this.doRecharge(recharge)
      }
    })
  },

  async addLotteryChance(openid, addCount = 1) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'addLotteryChance',
        data: { addCount: addCount }
      })
      console.log(`抽奖机会增加 ${addCount}`, result)
      return result.result?.code === 0
    } catch (err) {
      console.error('增加抽奖机会失败', err)
      return false
    }
  },

  async addRechargePoints(openid, orderId, amount) {
    try {
      const earnedPoints = Math.floor(amount || 0)
      if (earnedPoints <= 0) return

      // 幂等检查：是否已发放过
      const existRes = await db.collection('points_log')
        .where({ orderId: orderId, type: 'earn' })
        .get()
      if (existRes.data && existRes.data.length > 0) {
        console.log(`充值订单 ${orderId} 已发放过积分，跳过`)
        return
      }

      // 增加用户积分
      const userRes = await db.collection('user').where({ _openid: openid }).get()
      if (userRes.data && userRes.data.length > 0) {
        await db.collection('user').doc(userRes.data[0]._id).update({
          data: { points: db.command.inc(earnedPoints) }
        })
      }

      // 记录积分日志
      await db.collection('points_log').add({
        data: {
          _openid: openid,
          type: 'earn',
          amount: earnedPoints,
          description: '会员充值',
          orderId: orderId,
          createTime: db.serverDate()
        }
      })
      console.log(`充值 ¥${amount}，发放 ${earnedPoints} 积分`)
    } catch (err) {
      console.error('发放充值积分失败', err)
    }
  },

  async doRealRecharge(recharge) {
    wx.showLoading({ title: '拉起支付中...' })
    try {
      const openid = app.globalData.openid
      const totalGet = recharge.amount + recharge.giveAmount
      const userRes = await db.collection('user').where({ _openid: openid }).get()
      const userInfo = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null
      const oldBalance = userInfo?.balance || 0
      
      const orderRes = await db.collection('order').add({
        data: {
          type: 'recharge',
          rechargeId: recharge._id,
          amount: recharge.amount,
          giveAmount: recharge.giveAmount,
          totalGet: totalGet,
          pay_status: false,
          status: 0,
          createTime: db.serverDate(),
          userNickName: userInfo ? (userInfo.nickName || '') : '',
          userAvatar: userInfo ? (userInfo.avatarUrl || '') : '',
          userPhone: userInfo ? (userInfo.phoneNumber || '') : ''
        }
      })
      
      const outTradeNo = orderRes._id
      const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
      const payRes = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          body: `账户充值¥${recharge.amount}`,
          outTradeNo: outTradeNo,
          totalFee: recharge.amount * 100,
          nonceStr: nonceStr
        }
      })
      const payment = payRes.result?.payment || payRes.result
      wx.hideLoading()
      await wx.requestPayment(payment)
      
      wx.showLoading({ title: '处理中...' })
      const newBalance = oldBalance + totalGet
      await db.collection('user').doc(userInfo._id).update({ data: { balance: newBalance } })
      
      // 充值积分：1元=1积分
      await this.addRechargePoints(openid, outTradeNo, recharge.amount)
      
      // ========== 只有充值满100元才赠送抽奖机会 ==========
      let lotteryAdded = false
      if (recharge.amount >= 100) {
        const success = await this.addLotteryChance(openid, 1)
        if (success) lotteryAdded = true
      }
      // =================================================
      
      await db.collection('order').doc(outTradeNo).update({ data: { pay_status: true, status: 1 } })
      wx.hideLoading()
      
      let successMsg = `支付成功！到账¥${totalGet}`
      if (lotteryAdded) successMsg += `，赠送1次抽奖机会`
      wx.showToast({ title: successMsg, icon: 'success' })
      await this.loadUserInfo()
      
    } catch (err) {
      console.error('充值失败或已取消', err)
      wx.hideLoading()
      if (err?.errMsg?.indexOf('cancel') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        wx.showToast({ title: '支付失败，请重试', icon: 'none' })
      }
    }
  },

  async doMockRecharge(recharge) {
    wx.showLoading({ title: '模拟充值中...' })
    try {
      const openid = app.globalData.openid
      const totalGet = recharge.amount + recharge.giveAmount
      const userRes = await db.collection('user').where({ _openid: openid }).get()
      if (!userRes.data.length) throw new Error('用户不存在')
      const user = userRes.data[0]
      const oldBalance = user.balance || 0
      
      const orderRes = await db.collection('order').add({
        data: {
          type: 'recharge',
          rechargeId: recharge._id,
          amount: recharge.amount,
          giveAmount: recharge.giveAmount,
          totalGet: totalGet,
          pay_status: true,
          status: 1,
          createTime: db.serverDate(),
          userNickName: user.nickName || '',
          userAvatar: user.avatarUrl || '',
          userPhone: user.phoneNumber || ''
        }
      })
      
      const newBalance = oldBalance + totalGet
      await db.collection('user').doc(user._id).update({
        data: { balance: newBalance }
      })
      
      // 充值积分：1元=1积分
      await this.addRechargePoints(openid, orderRes._id, recharge.amount)
      
      // ========== 只有充值满100元才赠送抽奖机会 ==========
      let lotteryAdded = false
      if (recharge.amount >= 100) {
        const success = await this.addLotteryChance(openid, 1)
        if (success) lotteryAdded = true
      }
      // =================================================
      
      wx.hideLoading()
      
      let successMsg = `充值成功！到账¥${totalGet}`
      if (lotteryAdded) successMsg += `，赠送1次抽奖机会`
      wx.showToast({ title: successMsg, icon: 'success', duration: 2000 })
      
      await this.loadUserInfo()
      
      const pages = getCurrentPages()
      const myhomePage = pages.find(p => p.route === 'pages/myhome/myhome')
      if (myhomePage && myhomePage.loadMiandanCount) {
        myhomePage.loadMiandanCount()
      }
      
    } catch (err) {
      wx.hideLoading()
      console.error('模拟充值失败', err)
      wx.showToast({ title: '充值失败，请重试', icon: 'none' })
    }
  },

  async doRecharge(recharge) {
    if (this.data.useMockPay) {
      await this.doMockRecharge(recharge)
    } else {
      await this.doRealRecharge(recharge)
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '充值优惠 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/recharge/recharge' })
  },
  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '充值优惠 · ' + (getApp().globalData.shopName || '美食在线') })
  },

  async handleUserAuth(e) {
    try {
      await this.loadUserInfo()
      this.setData({ showAuthModal: false })
      if (this.data.pendingRecharge) {
        const recharge = this.data.pendingRecharge
        this.setData({ pendingRecharge: null })
        setTimeout(() => {
          const totalGet = recharge.amount + recharge.giveAmount
          wx.showModal({
            title: '确认充值',
            content: `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`,
            success: async (res) => {
              if (res.confirm) await this.doRecharge(recharge)
            }
          })
        }, 500)
      }
    } catch (err) {
      console.error('处理授权失败', err)
      wx.showToast({ title: '处理失败，请重试', icon: 'none' })
    }
  }
})