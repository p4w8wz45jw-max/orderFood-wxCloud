// pages-sub/admin/user/user.js
const db = wx.cloud.database()
const _ = db.command
const app = getApp()

Page({
  data: {
    users: [],
    searchKeyword: '',
    showBalanceModal: false,
    showPointsModal: false,
    showGiftCouponModal: false,
    showBalanceDetail: false,
    currentUser: null,
    editBalance: 0,
    editPoints: 0,
    pointsReason: '',
    isMember: false,
    // 分页相关
    userPage: 0,
    userPageSize: 20,
    userHasMore: true,
    loadingUsers: false,
    // 赠送优惠券
    couponList: [],
    selectedCouponIndex: 0,
    // 余额明细
    balanceHistory: [],
    balanceDetailLoading: false,
    // 查看用户优惠券
    showCouponsModal: false,
    userCoupons: [],
    filteredUserCoupons: [],
    userCouponStats: null,
    couponFilter: 'all',
    couponDetailLoading: false,
    // 查看用户历史订单
    showOrdersModal: false,
    userOrders: [],
    userOrderStats: null,
    orderDetailLoading: false,
    // 积分明细
    showPointsDetail: false,
    pointsHistory: [],
    pointsDetailLoading: false,
    pointsTotalText: '0'
  },

  onLoad() {
    this.setThemeColor()
    this.loadUsers()
    this.loadCouponList()
  },

  onShow() {
    this.setThemeColor()
    this.loadUsers()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  // 加载用户列表
  async loadUsers(append = false) {
    if (this.data.loadingUsers) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingUsers: true })

    try {
      const keyword = this.data.searchKeyword.trim()
      const pageSize = this.data.userPageSize
      const page = append ? this.data.userPage + 1 : 0
      
      // 调用云函数获取用户列表（使用聚合查询）
      const res = await wx.cloud.callFunction({
        name: 'getUserList',
        data: {
          keyword: keyword,
          page: page,
          pageSize: pageSize
        }
      })
      
      if (res.result && res.result.success) {
        const { list, hasMore } = res.result.data
        
        const newUsers = append ? this.data.users.concat(list) : list

        this.setData({
          users: newUsers,
          userPage: page,
          userHasMore: hasMore
        })
      } else {
        throw new Error(res.result?.error || '获取用户列表失败')
      }
    } catch (err) {
      console.error('加载用户失败', err)
      if (!append) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingUsers: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.userHasMore && !this.data.loadingUsers) {
      this.loadUsers(true)
    }
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  // 执行搜索
  doSearch() {
    this.loadUsers()
  },

  // 清空搜索
  clearSearch() {
    this.setData({
      searchKeyword: '',
      // 重置分页状态
      userPage: 0,
      userHasMore: true,
      users: []
    }, () => {
      this.loadUsers()
    })
  },

  // 显示用户优惠券弹窗
  async showCouponsModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showCouponsModal: true,
      currentUser: user,
      userCoupons: [],
      filteredUserCoupons: [],
      userCouponStats: null,
      couponFilter: 'all',
      couponDetailLoading: true
    })
    await this.loadUserCoupons(user)
  },

  // 关闭优惠券弹窗
  closeCouponsModal() {
    this.setData({
      showCouponsModal: false,
      currentUser: null,
      userCoupons: [],
      filteredUserCoupons: [],
      userCouponStats: null,
      couponFilter: 'all'
    })
  },

  // 筛选优惠券：全部 / 未用 / 已用 / 过期
  onCouponFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (!filter || filter === this.data.couponFilter) {
      return
    }
    const { userCoupons } = this.data
    const filtered = filter === 'all'
      ? userCoupons
      : userCoupons.filter(c => c.status === filter)
    this.setData({
      couponFilter: filter,
      filteredUserCoupons: filtered
    })
  },

  // 加载用户优惠券
  async loadUserCoupons(user) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserCoupons',
        data: { openid: user._openid }
      })
      if (res.result && res.result.success) {
        const list = res.result.data || []
        this.setData({
          userCoupons: list,
          filteredUserCoupons: list,
          userCouponStats: res.result.stats || null,
          couponFilter: 'all',
          couponDetailLoading: false
        })
      } else {
        throw new Error(res.result?.error || '获取优惠券失败')
      }
    } catch (err) {
      console.error('加载用户优惠券失败', err)
      this.setData({ couponDetailLoading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 删除用户优惠券
  async deleteUserCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon
    if (!coupon || !coupon._id) return

    const confirmRes = await wx.showModal({
      title: '删除优惠券',
      content: `确定删除该优惠券「${coupon.name}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#e54d42'
    })
    if (!confirmRes.confirm) return

    try {
      wx.showLoading({ title: '删除中...' })
      const result = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'remove', collection: 'user_coupons', docId: coupon._id }
      })
      wx.hideLoading()
      if (result.result && result.result.success) {
        wx.showToast({ title: '删除成功', icon: 'success' })
        // 删除后刷新当前用户的优惠券列表
        if (this.data.currentUser) {
          await this.loadUserCoupons(this.data.currentUser)
        }
      } else {
        throw new Error(result.result?.error || '删除失败')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('删除优惠券失败', err)
      wx.showToast({ title: err.message || '删除失败', icon: 'none' })
    }
  },

  // 显示用户历史订单弹窗
  async showOrdersModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showOrdersModal: true,
      currentUser: user,
      userOrders: [],
      userOrderStats: null,
      orderDetailLoading: true
    })
    await this.loadUserOrders(user)
  },

  // 关闭历史订单弹窗
  closeOrdersModal() {
    this.setData({
      showOrdersModal: false,
      currentUser: null,
      userOrders: [],
      userOrderStats: null
    })
  },

  // 点击订单进入订单详情
  goOrderDetail(e) {
    const order = e.currentTarget.dataset.order
    if (!order || !order._id) return
    wx.navigateTo({
      url: `/pages/orderDetail/orderDetail?id=${order._id}`
    })
  },

  // 加载用户历史订单
  async loadUserOrders(user) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserOrders',
        data: { openid: user._openid }
      })
      if (res.result && res.result.success) {
        this.setData({
          userOrders: res.result.data || [],
          userOrderStats: res.result.stats || null,
          orderDetailLoading: false
        })
      } else {
        throw new Error(res.result?.error || '获取订单失败')
      }
    } catch (err) {
      console.error('加载用户订单失败', err)
      this.setData({ orderDetailLoading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 点击手机号直接拨打电话
  callPhone(e) {
    const phone = e.currentTarget.dataset.phone
    if (!phone) {
      wx.showToast({ title: '该用户未绑定手机号', icon: 'none' })
      return
    }
    wx.makePhoneCall({
      phoneNumber: String(phone)
    })
  },

  // 查看积分明细
  async showPointsDetailModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showPointsDetail: true,
      currentUser: user,
      pointsHistory: [],
      pointsTotalText: (user.points || 0) + '',
      pointsDetailLoading: true
    })
    await this.loadPointsHistory(user)
  },

  // 关闭积分明细弹窗
  closePointsDetail() {
    this.setData({
      showPointsDetail: false,
      currentUser: null,
      pointsHistory: []
    })
  },

  // 积分变动类型默认文案
  pointsTypeText(type, amount) {
    if (amount > 0) {
      switch (type) {
        case 'earn': return '积分获得'
        case 'recharge': return '充值获得积分'
        default: return '积分增加'
      }
    }
    switch (type) {
      case 'spend': return '积分兑换'
      case 'refund_deduct': return '退款扣回积分'
      case 'admin_adjust': return '管理员调整'
      default: return '积分减少'
    }
  },

  // 加载积分变动历史（points_log）
  async loadPointsHistory(user) {
    try {
      const openid = user._openid
      const logRes = await db.collection('points_log')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(200)
        .get()

      const history = (logRes.data || []).map(log => {
        const amount = Number(log.amount) || 0
        return {
          id: log._id,
          type: log.type || '',
          amount,
          isIncome: amount > 0,
          signedAmount: (amount > 0 ? '+' : '') + amount,
          date: this.formatTime(log.createTime),
          description: log.description || log.reason || this.pointsTypeText(log.type, amount),
          rawTime: log.createTime
        }
      })

      // 兜底按时间倒序
      history.sort((a, b) => {
        const t1 = a.rawTime ? new Date(a.rawTime).getTime() : 0
        const t2 = b.rawTime ? new Date(b.rawTime).getTime() : 0
        return t2 - t1
      })

      this.setData({
        pointsHistory: history,
        pointsDetailLoading: false
      })
    } catch (err) {
      console.error('加载积分明细失败', err)
      this.setData({ pointsDetailLoading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 显示编辑余额弹窗
  showEditBalanceModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showBalanceModal: true,
      currentUser: user,
      editBalance: user.balance || 0
    })
  },

  // 关闭余额弹窗
  closeBalanceModal() {
    this.setData({
      showBalanceModal: false,
      currentUser: null
    })
  },

  // 查看余额明细
  async showBalanceDetailModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showBalanceDetail: true,
      currentUser: user,
      balanceHistory: [],
      balanceDetailLoading: true
    })
    await this.loadBalanceHistory(user)
  },

  // 关闭余额明细弹窗
  closeBalanceDetail() {
    this.setData({
      showBalanceDetail: false,
      currentUser: null,
      balanceHistory: []
    })
  },

  // 加载余额变动历史
  async loadBalanceHistory(user) {
    try {
      const openid = user._openid
      const history = []

      // 1. 查询管理员调整记录
      const logRes = await db.collection('balance_log')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()
      
      if (logRes.data && logRes.data.length > 0) {
        logRes.data.forEach(log => {
          history.push({
            id: log._id,
            type: log.type,
            amount: log.amount,
            date: this.formatTime(log.createTime),
            description: log.description || (log.amount > 0 ? `余额变动 +¥${log.amount.toFixed(2)}` : `余额变动 -¥${Math.abs(log.amount).toFixed(2)}`),
            isIncome: log.amount > 0,
            rawTime: log.createTime
          })
        })
      }

      // 2. 查询充值订单记录
      const rechargeRes = await db.collection('order')
        .where({ _openid: openid, type: 'recharge', pay_status: true })
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
            date: this.formatTime(order.createTime),
            description: `在线充值 +¥${totalGet.toFixed(2)}${order.giveAmount ? ` (含赠¥${order.giveAmount})` : ''}`,
            isIncome: true,
            rawTime: order.createTime
          })
        })
      }

      // 3. 查询消费订单（使用余额支付的）
      const orderRes = await db.collection('order')
        .where(_.and([
          { _openid: openid },
          _.or([
            { type: _.exists(false) },
            { type: _.in(['dineIn', 'takeout', 'dine_in', 'take_out']) }
          ])
        ]))
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()

      if (orderRes.data && orderRes.data.length > 0) {
        orderRes.data.forEach(order => {
          // 计算余额支付金额
          let balancePay = order.balancePay || order.balancePayAmount || 0
          if (!balancePay && order.finalPrice !== undefined && order.totalPrice !== undefined) {
            balancePay = order.totalPrice - order.finalPrice
            if (balancePay < 0) balancePay = 0
          }
          if (balancePay > 0) {
            history.push({
              id: order._id,
              type: 'order_pay',
              amount: -balancePay,
              date: this.formatTime(order.createTime),
              description: `点餐消费 -¥${balancePay.toFixed(2)}`,
              isIncome: false,
              rawTime: order.createTime
            })
          }
        })
      }

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
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 格式化时间
  formatTime(date) {
    if (!date) return '未知'
    const d = new Date(date)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}`
  },

  // 加载优惠券列表（用于赠送选择）
  async loadCouponList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'coupon' }
      })
      const result = res.result || {}
      const list = result.success ? (result.data || []) : []
      // 只显示启用的优惠券
      const enabledList = list.filter(c => c.enable !== false)
      this.setData({ couponList: enabledList })
    } catch (err) {
      console.error('加载优惠券列表失败', err)
    }
  },

  // 显示赠送优惠券弹窗
  showGiftCouponModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showGiftCouponModal: true,
      currentUser: user,
      selectedCouponIndex: 0
    })
    // 确保优惠券列表已加载
    if (this.data.couponList.length === 0) {
      this.loadCouponList()
    }
  },

  // 关闭赠送弹窗
  closeGiftCouponModal() {
    this.setData({
      showGiftCouponModal: false,
      currentUser: null
    })
  },

  // 选择优惠券
  onCouponSelect(e) {
    this.setData({
      selectedCouponIndex: parseInt(e.detail.value)
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入余额
  onBalanceInput(e) {
    this.setData({
      editBalance: parseFloat(e.detail.value) || 0
    })
  },

  // 保存余额
  async saveBalance() {
    const { currentUser, editBalance } = this.data

    if (editBalance < 0) {
      wx.showToast({
        title: '余额不能为负数',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      const oldBalance = currentUser.balance || 0
      const diff = editBalance - oldBalance

      // 更新用户余额
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'user', docId: currentUser._id, data: { balance: editBalance } }
      })

      // 写入余额变动日志
      if (diff !== 0) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: {
            action: 'add',
            collection: 'balance_log',
            data: {
              _openid: currentUser._openid,
              type: 'admin_adjust',
              amount: diff,
              balanceBefore: oldBalance,
              balanceAfter: editBalance,
              description: diff > 0 ? `管理员充值 +¥${diff.toFixed(2)}` : `管理员扣减 -¥${Math.abs(diff).toFixed(2)}`,
              createTime: new Date()
            }
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeBalanceModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 显示编辑积分弹窗
  showEditPointsModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showPointsModal: true,
      currentUser: user,
      editPoints: user.points || 0,
      pointsReason: ''
    })
  },

  // 关闭积分弹窗
  closePointsModal() {
    this.setData({
      showPointsModal: false,
      currentUser: null,
      pointsReason: ''
    })
  },

  // 输入积分
  onPointsInput(e) {
    this.setData({
      editPoints: parseInt(e.detail.value) || 0
    })
  },

  // 输入变动说明
  onPointsReasonInput(e) {
    this.setData({
      pointsReason: e.detail.value
    })
  },

  // 保存积分
  async savePoints() {
    const { currentUser, editPoints, pointsReason } = this.data

    if (editPoints < 0) {
      wx.showToast({ title: '积分不能为负数', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      const oldPoints = currentUser.points || 0
      const diff = editPoints - oldPoints

      // 更新用户积分
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'user', docId: currentUser._id, data: { points: editPoints } }
      })

      // 写入积分变动日志
      if (diff !== 0) {
        const reasonText = pointsReason.trim() || (diff > 0 ? '管理员手动增加积分' : '管理员手动扣减积分')
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: {
            action: 'add',
            collection: 'points_log',
            data: {
              _openid: currentUser._openid,
              type: 'admin_adjust',
              amount: diff,
              description: `${reasonText}（${diff > 0 ? '+' : ''}${diff}）`,
              createTime: new Date()
            }
          }
        })
      }

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })

      this.closePointsModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      console.error('保存积分失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // 保存赠送优惠券
  async saveGiftCoupon() {
    const { currentUser, selectedCouponIndex, couponList } = this.data

    const selectedCoupon = couponList[selectedCouponIndex]
    if (!selectedCoupon) {
      wx.showToast({ title: '请选择优惠券', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '赠送中...' })

      // 计算过期时间
      const expireDays = selectedCoupon.expireDays || 30
      const expireTime = new Date(Date.now() + expireDays * 86400000)

      // 构建 user_coupons 记录
      const couponData = {
        _openid: currentUser._openid,
        couponId: selectedCoupon._id,
        name: selectedCoupon.name,
        type: selectedCoupon.type,
        expireDays: expireDays,
        expireTime: expireTime,
        used: false,
        source: 'admin_gift',
        createTime: new Date()
      }

      // 根据类型复制对应字段
      if (selectedCoupon.type === 'full_reduction') {
        couponData.condition = selectedCoupon.condition || 0
        couponData.value = selectedCoupon.value || 0
      } else if (selectedCoupon.type === 'discount') {
        couponData.discount = selectedCoupon.discount || 0
      } else if (selectedCoupon.type === 'product') {
        couponData.productId = selectedCoupon.productId || ''
        couponData.productName = selectedCoupon.productName || ''
      }

      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: {
          action: 'add',
          collection: 'user_coupons',
          data: couponData
        }
      })

      wx.hideLoading()
      wx.showToast({
        title: '赠送成功',
        icon: 'success'
      })

      this.closeGiftCouponModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      console.error('赠送优惠券失败', err)
      wx.showToast({
        title: '赠送失败',
        icon: 'none'
      })
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})
