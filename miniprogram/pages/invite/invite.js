// pages/invite/invite.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    inviteEnabled: false,
    inviteDesc: '',
    rewardCoupon: null,
    userInfo: null,
    themeColor: '#B8956E',
    inviterOpenid: '',
    showShareTip: false
  },

  onLoad(options) {
    this.setThemeColor()
    this.setData({ themeColor: app.globalData.themeColor || '#B8956E' })
    this.loadInviteConfig()
    this.loadUserInfo()
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

  async loadInviteConfig() {
    try {
      const res = await db.collection('config').doc('invite_reward').get()
      if (res.data && res.data.inviteEnabled) {
        this.setData({
          inviteEnabled: true,
          inviteDesc: res.data.inviteDesc || '邀请好友下单，获得优惠券奖励！'
        })

        // 加载奖励优惠券详情
        if (res.data.rewardCouponId) {
          try {
            const couponRes = await db.collection('coupon').doc(res.data.rewardCouponId).get()
            if (couponRes.data) {
              let desc = ''
              const c = couponRes.data
              if (c.type === 'full_reduction') {
                desc = `满${c.condition}元减${c.value}元`
              } else if (c.type === 'discount') {
                desc = `${(c.discount * 10).toFixed(1)}折券`
              } else if (c.type === 'product') {
                desc = '指定商品免费券'
              }
              this.setData({
                rewardCoupon: {
                  name: c.name,
                  desc: desc
                }
              })
            }
          } catch (e) {
            console.error('加载优惠券详情失败', e)
          }
        }
      }
    } catch (err) {
      console.error('加载邀请配置失败', err)
    }
  },

  async loadUserInfo() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const res = await db.collection('user').where({ _openid: openid }).get()
      if (res.data && res.data.length > 0) {
        this.setData({ userInfo: res.data[0], inviterOpenid: openid })
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },

  // 邀请好友下单 - 触发分享
  inviteFriend() {
    this.setData({ showShareTip: true })
    // 自动隐藏提示
    setTimeout(() => {
      this.setData({ showShareTip: false })
    }, 3000)
  },

  // 查看我的邀请记录
  async viewInviteRecords() {
    wx.showLoading({ title: '加载中...' })
    try {
      const openid = app.globalData.openid
      const res = await db.collection('invite_records')
        .where({ inviterOpenid: openid })
        .orderBy('createTime', 'desc')
        .get()
      wx.hideLoading()

      const records = res.data || []
      const successCount = records.filter(r => r.status === 'success').length

      if (records.length === 0) {
        wx.showToast({ title: '暂无邀请记录', icon: 'none' })
        return
      }

      wx.showModal({
        title: '邀请记录',
        content: `共邀请 ${records.length} 人，其中 ${successCount} 人已成功下单`,
        showCancel: false,
        confirmText: '知道了'
      })
    } catch (err) {
      wx.hideLoading()
      console.error('加载邀请记录失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({
      type: 'brand',
      title: this.data.inviteDesc || '邀请有奖 · ' + (getApp().globalData.shopName || '美食在线'),
      path: `/pages/index/index?inviter=${this.data.inviterOpenid}`
    })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: this.data.inviteDesc || '邀请有奖 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})
