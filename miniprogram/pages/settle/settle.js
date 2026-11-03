// pages/settle/settle.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    themeColor: '#B8956E',
    orderGoods: [],
    totalPrice: 0,
    finalPrice: 0,
    displayTotal: 0,
    deliveryType: 'dineIn',
    selectedAddress: null,
    deliveryFee: 0,
    payMethod: 'balance',
    userInfo: null,
    userBalance: 0,
    submitting: false,
    canSubmit: false,
    showAuthModal: false,
    savedPayMethod: null,
    shopLocation: null,
    deliveryRules: {},
    shopName: '',
    couponList: [],
    selectedCoupon: null,
    showCouponPicker: false,
    couponDiscount: 0,
    remark: '',
    minDeliveryAmount: 0,
    timeSlots: [],
    showTimeModal: false,
    selectedTime: '',
    showRewardPopup: false,
    rewardPopupImage: '',
    rewardPopupText: '',
    balancePayAmount: 0,
    wechatPayAmount: 0,
    freeDeliveryThreshold: 0,
    freeLotteryThreshold: 0,
    shopIsOpen: true,     // 新增：店铺营业状态
    balanceDiscountRate: 1,  // 店铺默认会员余额支付折扣（已取消95折，1=无折扣）
    balanceDiscount: 0,          // 余额支付优惠金额
    balanceDiscountedTotal: 0,   // 余额支付折后总额
    wxDiscount: 0,               // 微信支付时菜品自定义折扣优惠金额
    wxOriginalTotal: 0,          // 微信支付未打折前的原应付金额（含优惠券/配送费）
    hasSpecialDish: false,       // 订单中是否存在非默认95折的菜品（关闭95折或设置全场折扣）
    groupBuyDiscount: 0,           // 团购优惠金额
    shopInfoLoaded: false,          // 店铺信息是否已加载完成
    pendingAddressCalc: false,      // 是否有待处理的地址配送费计算
    isDiyOrder: false,              // 是否 DIY 菜单订单（使用独立按距离配送费规则）
    diyDeliveryRules: null,         // DIY 订单配送费规则 {baseFee, baseKm, perKmFee, maxKm}
    diyFeeTip: '',                  // DIY 配送费规则说明文案
  },

  USE_MOCK_PAY: false,   // 真实支付，不使用模拟

  onLoad(options) {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
    const selectedType = wx.getStorageSync('selectedDeliveryType')
    if (selectedType === 'dineIn' || selectedType === 'takeout') {
      this.setData({ deliveryType: selectedType })
    }
    this.loadCartData()
    this.loadUserInfo()
    this.loadShopInfo()
    this.loadTimeSlots()
  },

  onShow() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
    this.loadUserInfo()
    this.updateCanSubmit()
    const selectedAddress = wx.getStorageSync('selectedAddressFromList')
    if (selectedAddress) {
      wx.removeStorageSync('selectedAddressFromList')
      this.setData({ selectedAddress }, () => {
        // 只有店铺信息已加载时才计算配送费，否则标记待处理
        if (this.data.deliveryType === 'takeout') {
          if (this.data.shopInfoLoaded) {
            this.calcDeliveryFee()
          } else {
            this.setData({ pendingAddressCalc: true })
            console.log('[settle] 店铺信息尚未加载，标记配送费待计算')
          }
        }
        this.updateCanSubmit()
      })
    }
  },

  async loadTimeSlots() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data && res.data.length > 0 && res.data[0].timeSlots) {
        let slots = res.data[0].timeSlots
        // 确保是数组
        if (!Array.isArray(slots)) {
          slots = []
        }
        // 过滤掉空字符串
        slots = slots.filter(s => s && String(s).trim().length > 0)
        this.setData({ timeSlots: slots })
        // 不再自动选中第一个时段，让顾客自行选择
      } else {
        this.setData({ timeSlots: [], selectedTime: '立即' })
      }
    } catch (err) {
      console.error('加载时间段失败', err)
      this.setData({ timeSlots: [], selectedTime: '立即' })
    }
  },

  showTimePicker() {
    this.setData({ showTimeModal: true })
  },

  closeTimeModal() {
    this.setData({ showTimeModal: false })
  },

  selectTimeSlot(e) {
    const time = e.currentTarget.dataset.time
    this.setData({ selectedTime: time, showTimeModal: false })
  },

  stopPropagation() {},

  onAddressSelected(address) {
    if (this.data.deliveryType === 'takeout' && (!address.latitude || !address.longitude)) {
      wx.showModal({
        title: '地址不完整',
        content: '该地址缺少位置信息，无法计算配送费，请编辑后重新选择',
        confirmText: '去编辑',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: `/pages/address/edit/edit?address=${encodeURIComponent(JSON.stringify(address))}` })
          }
        }
      })
      return
    }
    this.setData({ selectedAddress: address }, () => {
      if (this.data.deliveryType === 'takeout') this.calcDeliveryFee()
      this.updateCanSubmit()
    })
  },

  async loadShopInfo() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data.length) {
        const shop = res.data[0]
        let location = shop.location
        if (location && location.lng === undefined && location.long !== undefined) location.lng = location.long
        let rules = shop.deliveryFeeRules || {}
        const deliveryRules = {
          baseFee: rules.baseFee !== undefined ? rules.baseFee : 3,
          baseDistance: rules.baseDistance !== undefined ? rules.baseDistance : 3000,
          perKmFee: rules.perKmFee !== undefined ? rules.perKmFee : 2,
          maxDistance: rules.maxDistance !== undefined ? rules.maxDistance : 20000,
          freeDeliveryThreshold: rules.freeDeliveryThreshold !== undefined ? rules.freeDeliveryThreshold : 0
        }
        this.setData({
          shopLocation: location,
          deliveryRules: deliveryRules,
          shopName: shop.name || '店铺',
          minDeliveryAmount: shop.minDeliveryAmount || 0,
          freeDeliveryThreshold: deliveryRules.freeDeliveryThreshold,
          freeLotteryThreshold: shop.freeLotteryThreshold || 0,
          shopIsOpen: shop.isOpen !== false,   // 新增：未设置时默认营业
          shopInfoLoaded: true
        }, () => {
          // 配送规则加载完成后，处理配送费计算
          if (this.data.deliveryType === 'takeout' && this.data.selectedAddress) {
            console.log('[settle] 店铺信息加载完毕，执行配送费计算')
            this.calcDeliveryFee()
          } else if (this.data.pendingAddressCalc) {
            console.log('[settle] 店铺信息加载完毕，清理待处理标记')
            this.setData({ pendingAddressCalc: false })
          }
        })
      } else {
        this.setData({ deliveryRules: { baseFee: 3, baseDistance: 3000, perKmFee: 2, maxDistance: 20000, freeDeliveryThreshold: 0 }, shopInfoLoaded: true }, () => {
          if (this.data.deliveryType === 'takeout' && this.data.selectedAddress) {
            console.log('[settle] 使用默认配送规则，执行配送费计算')
            this.calcDeliveryFee()
          }
        })
      }
    } catch (err) { console.error(err) }
  },

  loadCartData() {
    try {
      const cartData = wx.getStorageSync('settleCartData')
      if (cartData) {
        const goodsList = []
        for (let cartKey in cartData.cart) {
          const item = cartData.cart[cartKey]
          let tagsArray = []
          if (item.tagLabels && Array.isArray(item.tagLabels)) tagsArray = item.tagLabels
          else if (item.tags && typeof item.tags === 'object') {
            Object.keys(item.tags).forEach(tagId => {
              const value = item.tags[tagId]
              if (Array.isArray(value)) tagsArray.push(...value)
              else if (value) tagsArray.push(value)
            })
          }
          const unitPrice = Number(item.info.price) || 0
          // 菜品「不参与95折」：仅关闭余额支付时的店铺默认95折，不影响全场自定义折扣
          const noMemberDiscount = item.info.noMemberDiscount === true
          // 全场自定义折扣：按支付百分比入库（如 90=按原价90%结算，顾客端显示为9折），对所有用户/支付方式生效
          const customDiscountRaw = Number(item.info.customDiscount) || 0
          const customDiscount = (customDiscountRaw > 0 && customDiscountRaw < 100) ? customDiscountRaw : 0
          const customRate = customDiscount > 0 ? customDiscount / 100 : 1
          const defaultRate = this.data.balanceDiscountRate || 1
          // 微信支付折扣率：仅全场自定义折扣（无则原价）
          const wxRate = customRate
          // 余额支付折扣率：参与95折的取「自定义折扣」与「默认95折」中更优惠者（不叠加）；
          // 不参与95折的只保留自定义折扣（无自定义折扣则按原价）
          const balRate = noMemberDiscount ? customRate : Math.min(customRate, defaultRate)
          const subtotal = (Math.round(unitPrice * item.count * 100) / 100).toFixed(2)
          // 微信支付折后单价/小计（菜品自定义折扣生效，原价菜与折后一致）
          const wxPrice = (Math.round(unitPrice * wxRate * 100) / 100).toFixed(2)
          const wxSubtotal = (Math.round(Math.round(unitPrice * wxRate * 100) / 100 * item.count * 100) / 100).toFixed(2)
          // 余额支付折后单价/小计（自定义折扣与95折取更优惠，均不叠加）
          const balancePrice = (Math.round(unitPrice * balRate * 100) / 100).toFixed(2)
          const balanceSubtotal = (Math.round(Math.round(unitPrice * balRate * 100) / 100 * item.count * 100) / 100).toFixed(2)
          goodsList.push({
            dishId: item.dishId || item.info._id,
            dishName: item.info.name,
            dishImage: item.info.image,
            price: unitPrice,
            count: item.count,
            tags: tagsArray,
            subtotal: subtotal,
            wxPrice: wxPrice,
            wxSubtotal: wxSubtotal,
            wxDiscounted: wxRate < 1,
            balDiscounted: balRate < 1,
            balancePrice: balancePrice,
            balanceSubtotal: balanceSubtotal,
            noMemberDiscount: noMemberDiscount,
            customDiscount: customDiscount,
            customDiscountText: this.formatCustomDiscountLabel(customDiscount),
            canUseMiandan: false
          })
        }
        const orderMode = cartData.orderMode || 'dineIn'
        let totalPrice = Number(cartData.totalPrice) || 0
        // 从 orderGoods 重新计算总额，防止存储值与实际商品金额不一致
        const recalculatedTotal = goodsList.reduce((sum, g) => Math.round((sum + g.price * g.count) * 100) / 100, 0)
        if (recalculatedTotal > 0 && Math.abs(recalculatedTotal - totalPrice) > 0.01) {
          console.warn(`总价不一致：存储值=${totalPrice}，重新计算值=${recalculatedTotal}，使用重新计算值`)
          totalPrice = recalculatedTotal
        }
        const isDiyOrder = cartData.isDiyOrder || false
        let delivery = this.data.deliveryType
        if (isDiyOrder) {
          // DIY 订单按距离计配送费，强制走外卖配送
          delivery = 'takeout'
        } else if (!delivery || delivery === 'dineIn') {
          delivery = orderMode === 'takeOut' ? 'takeout' : 'dineIn'
        }
        this.setData({ deliveryType: delivery })
        const diyDeliveryRules = cartData.diyDeliveryRules || null
        this.setData({
          orderGoods: goodsList,
          totalPrice: totalPrice,
          finalPrice: totalPrice,
          displayTotal: totalPrice,
          isDiyOrder,
          diyDeliveryRules,
          diyFeeTip: this.buildDiyFeeTip(diyDeliveryRules),
          deliveryFee: 0,
          hasSpecialDish: goodsList.some(g => g.noMemberDiscount || (Number(g.customDiscount) > 0 && Number(g.customDiscount) < 100))
        }, () => {
          // DIY 订单加载后立即按规则计算配送费（若店铺信息与地址均已就绪）
          if (isDiyOrder && this.data.shopInfoLoaded && this.data.selectedAddress) {
            this.calcDeliveryFee()
          }
        })
        wx.removeStorageSync('settleCartData')
        this.loadAvailableCoupons()
      } else {
        wx.showToast({ title: '购物车为空', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (err) {
      console.error('加载购物车数据失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async loadAvailableCoupons() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const now = new Date()
      const totalAmount = this.data.totalPrice
      const res = await db.collection('user_coupons')
        .where({ _openid: openid, used: false, expireTime: db.command.gt(now) })
        .get()
      let coupons = res.data || []
      const validCoupons = []
      for (let coupon of coupons) {
        let isValid = false
        let discountAmount = 0
        let displayValue = ''
        if (coupon.type === 'product') {
          const hasProduct = this.data.orderGoods.some(g => g.dishId === coupon.productId)
          if (hasProduct) {
            isValid = true
            const product = this.data.orderGoods.find(g => g.dishId === coupon.productId)
            discountAmount = product ? product.price : 0
            displayValue = `-?${discountAmount.toFixed(2)}`
            coupon.discountAmount = discountAmount
            coupon.displayValue = displayValue
          }
        } else if (coupon.type === 'discount') {
          isValid = true
          const discountRate = coupon.discount || 0.9
          discountAmount = totalAmount * (1 - discountRate)
          displayValue = `-¥${discountAmount.toFixed(2)}`
          coupon.discountAmount = discountAmount
          coupon.displayValue = displayValue
        } else if (coupon.type === 'full_reduction') {
          const condition = coupon.condition || 0
          if (totalAmount >= condition) {
            isValid = true
            discountAmount = coupon.value || 0
            displayValue = `-?${discountAmount}`
            coupon.discountAmount = discountAmount
            coupon.displayValue = displayValue
          }
        }
        if (isValid) validCoupons.push(coupon)
      }
      this.setData({ couponList: validCoupons })
      if (validCoupons.length > 0) this.autoSelectBestCoupon(validCoupons)
    } catch (err) { console.error('加载优惠券失败', err) }
  },

  autoSelectBestCoupon(coupons) {
    const best = [...coupons].sort((a, b) => b.discountAmount - a.discountAmount)[0]
    if (best) {
      const discount = best.discountAmount
      this.setData({ selectedCoupon: best, couponDiscount: discount, showCouponPicker: false })
      this.updateFinalPriceWithCoupon()
    }
  },

  showCouponSelector() {
    if (this.data.couponList.length === 0) {
      wx.showToast({ title: '暂无可用的优惠券', icon: 'none' })
      return
    }
    this.setData({ showCouponPicker: true })
  },

  selectCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon
    const discount = coupon.discountAmount || this.calculateCouponDiscount(coupon)
    this.setData({ selectedCoupon: coupon, couponDiscount: discount, showCouponPicker: false })
    this.updateFinalPriceWithCoupon()
    wx.showToast({ title: `已优惠\u00a5${discount.toFixed(2)}`, icon: 'success' })
  },

  cancelCoupon() {
    this.setData({ selectedCoupon: null, couponDiscount: 0, showCouponPicker: false })
    this.updateFinalPriceWithCoupon()
  },

  calculateCouponDiscount(coupon) {
    const totalAmount = this.data.totalPrice
    if (coupon.type === 'discount') {
      const discountRate = coupon.discount || 0.9
      return totalAmount * (1 - discountRate)
    } else if (coupon.type === 'full_reduction') {
      return coupon.value || 0
    } else if (coupon.type === 'product') {
      const product = this.data.orderGoods.find(g => g.dishId === coupon.productId)
      return product ? product.price : 0
    }
    return 0
  },

  updateFinalPriceWithCoupon() {
    const { totalPrice, couponDiscount } = this.data
    let basePrice = totalPrice - couponDiscount
    if (basePrice < 0) basePrice = 0
    let displayTotal = basePrice + this.getChargeFee()
    this.setData({ finalPrice: basePrice, displayTotal: displayTotal })
    this.updatePayMethod()
  },

  closeCouponPicker() { this.setData({ showCouponPicker: false }) },

  async loadUserInfo() {
    try {
      // 优先从内存读取，其次从本地缓存读取
      let userInfo = app.globalData.userInfo
      if (!userInfo || !userInfo.phoneNumber) {
        try {
          const cached = wx.getStorageSync('userInfo')
          if (cached && cached.phoneNumber) {
            userInfo = cached
            app.globalData.userInfo = cached
          }
        } catch (_) {}
      }

      // 每次加载都从数据库拉取最新余额，确保余额实时显示
      if (userInfo && userInfo.phoneNumber) {
        const openid = app.globalData.openid
        try {
          const dbRes = await wx.cloud.database().collection('user').where({ _openid: openid }).get()
          if (dbRes.data && dbRes.data.length > 0) {
            const latest = dbRes.data[0].balance
            if (typeof latest === 'number') {
              userInfo.balance = latest
              app.globalData.userInfo = userInfo
              try { wx.setStorageSync('userInfo', userInfo) } catch (_) {}
            }
          }
        } catch (e) { console.error('刷新余额失败', e) }
        this.setData({ userInfo, userBalance: userInfo.balance || 0 })
        this.updatePayMethod()
        this.updateCanSubmit()
      }
    } catch (err) { console.error(err) }
  },

  chooseAddress() { wx.navigateTo({ url: '/pages/address/list/list?from=settle' }) },

  onUserInfoSaved(e) {
    // 用授权组件返回的数据更新 userInfo 和全局数据
    const detail = e.detail || {}
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
    if (this.data.userInfo && this.data.userInfo.phoneNumber) {
      // 登录成功，自动重新提交
      this.checkAndSubmit()
    }
  },

  // 本次订单应计入的配送费（DIY 订单强制外卖，走已算好的 deliveryFee）
  getChargeFee() {
    const { deliveryFee, deliveryType } = this.data
    return deliveryType === 'takeout' ? (Number(deliveryFee) || 0) : 0
  },

  // 生成 DIY 配送费规则说明文案
  buildDiyFeeTip(rules) {
    if (!rules) return ''
    const base = Number(rules.baseFee) || 0
    const baseKm = Number(rules.baseKm) || 0
    const perKm = Number(rules.perKmFee) || 0
    const maxKm = Number(rules.maxKm) || 0
    let tip = 'DIY配送费：'
    if (baseKm > 0) tip += `${baseKm}公里内¥${base}`
    else tip += `基础费¥${base}`
    if (perKm > 0) tip += `，超出每公里+¥${perKm}`
    if (maxKm > 0) tip += `，最多配送${maxKm}公里`
    return tip
  },

  // 取当前订单的配送费规则：DIY 订单用独立规则（公里换算为米），普通订单用店铺规则
  getDeliveryRules() {
    if (this.data.isDiyOrder) {
      const r = this.data.diyDeliveryRules || {}
      const normal = this.data.deliveryRules || {}
      return {
        baseFee: r.baseFee !== undefined ? r.baseFee : 0,
        baseDistance: r.baseKm > 0 ? r.baseKm * 1000 : 0,
        perKmFee: r.perKmFee !== undefined ? r.perKmFee : 0,
        maxDistance: r.maxKm > 0 ? r.maxKm * 1000 : (normal.maxDistance !== undefined ? normal.maxDistance : 20000),
        freeDeliveryThreshold: 0 // DIY 订单不参与满额免配送
      }
    }
    return this.data.deliveryRules
  },

  calcDeliveryFee() {
    const rules = this.getDeliveryRules()
    const { selectedAddress, shopLocation, totalPrice } = this.data
    const freeDeliveryThreshold = this.data.isDiyOrder ? 0 : rules.freeDeliveryThreshold
    console.log('[settle] calcDeliveryFee 开始计算，deliveryRules=', JSON.stringify(rules))
    if (freeDeliveryThreshold > 0 && totalPrice >= freeDeliveryThreshold) {
      this.setData({ deliveryFee: 0 }, () => this.updateFinalPrice(this.data.payMethod))
      console.log(`[settle] 订单总额 ${totalPrice} 满足免配送费条件（门槛${freeDeliveryThreshold}），配送费为0`)
      return
    }
    if (!selectedAddress || !shopLocation) {
      this.setData({ deliveryFee: 0 }, () => this.updateFinalPrice(this.data.payMethod))
      console.log('[settle] 缺少地址或店铺位置，配送费为0')
      return
    }
    const shopLat = shopLocation.lat, shopLng = shopLocation.lng
    const userLat = selectedAddress.latitude, userLng = selectedAddress.longitude
    if (!shopLat || !shopLng || !userLat || !userLng) {
      this.setData({ deliveryFee: rules.baseFee || 0 }, () => this.updateFinalPrice(this.data.payMethod))
      console.log('[settle] 缺少经纬度，使用基础配送费:', rules.baseFee)
      return
    }
    const straightDistance = this.getDistance(shopLat, shopLng, userLat, userLng)
    // 直线距离 × 道路系数 ≈ 地图导航距离（城市道路通常为直线距离的1.3~1.5倍）
    const roadRatio = 1.35
    const distance = Math.round(straightDistance * roadRatio)
    let fee = rules.baseFee !== undefined ? rules.baseFee : 0
    const baseDist = rules.baseDistance !== undefined ? rules.baseDistance : 0
    const perKm = rules.perKmFee !== undefined ? rules.perKmFee : 0
    const maxDist = rules.maxDistance !== undefined ? rules.maxDistance : 20000
    console.log(`[settle] 直线距离=${straightDistance}m, 预估道路距离=${distance}m (系数${roadRatio}), 基础费=${fee}, 基础距离=${baseDist}m, 每公里=${perKm}, 最大距离=${maxDist}m`)
    if (distance > maxDist) {
      wx.showModal({
        title: '超出配送范围',
        content: `您的地址距离本店约 ${Math.round(distance/1000)} 公里，超出最大配送范围（${Math.round(maxDist/1000)} 公里）。请选择堂食或更换地址。`,
        confirmText: '我知道了', showCancel: false
      })
      this.setData({ deliveryFee: 0 }, () => this.updateFinalPrice(this.data.payMethod))
      return
    }
    if (distance > baseDist) {
      const extraKm = Math.ceil((distance - baseDist) / 1000)
      fee += extraKm * perKm
      console.log(`[settle] 道路距离${distance}m超出基础距离${baseDist}m，额外${extraKm}公里，加收${extraKm * perKm}元，总配送费=${fee}`)
    } else {
      console.log(`[settle] 道路距离${distance}m未超出基础距离${baseDist}m，配送费=${fee}`)
    }
    this.setData({ deliveryFee: fee }, () => this.updateFinalPrice(this.data.payMethod))
  },

  getDistance(lat1, lng1, lat2, lng2) {
    const rad = (d) => d * Math.PI / 180.0
    const R = 6371000
    const dLat = rad(lat2 - lat1)
    const dLng = rad(lng2 - lng1)
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  },

  updateCanSubmit() {
    const { orderGoods, deliveryType, selectedAddress } = this.data
    let canSubmit = true
    if (!orderGoods.length) canSubmit = false
    if (deliveryType === 'takeout' && !selectedAddress) canSubmit = false
    this.setData({ canSubmit })
  },

  selectPayMethod(e) {
    const payMethod = e.currentTarget.dataset.value
    const { userBalance, totalPrice, couponDiscount } = this.data
    let totalPay = totalPrice - couponDiscount
    if (totalPay < 0) totalPay = 0
    totalPay += this.getChargeFee()

    if (payMethod === 'balance') {
      // 余额为0时余额支付选项已禁用，点击直接跳转充值页面
      if (userBalance <= 0) {
        this.goRecharge()
        return
      }
      // 余额支付享受95折（不参与95折的商品按原价）
      const discountedPay = this.calcBalanceDiscountedTotal(totalPay)
      if (userBalance >= discountedPay) {
        this.setData({ payMethod: 'balance' })
        this.updateFinalPrice('balance')
      } else {
        wx.showModal({
          title: '余额不足',
          content: `您的余额为\u00a5${userBalance}，订单折后需支付\u00a5${discountedPay}（原价\u00a5${totalPay}）。是否使用余额支付\u00a5${userBalance}，剩余\u00a5${(discountedPay - userBalance).toFixed(2)}使用微信支付？`,
          confirmText: '确定',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.setData({ payMethod: 'mix' })
              this.updateFinalPrice('mix')
              // 确认混合支付后直接提交订单，拉起微信支付补差额
              this.checkAndSubmit()
            } else {
              this.setData({ payMethod: 'wechat' })
              this.updateFinalPrice('wechat')
            }
          }
        })
      }
    } else {
      this.setData({ payMethod: payMethod })
      this.updateFinalPrice(payMethod)
    }
  },

  // 余额为0时引导用户去充值（会员卡整单95折）
  goRecharge() {
    // 充值页是 tabBar 页面，必须用 switchTab 跳转
    wx.switchTab({ url: '/pages/recharge/recharge' })
  },

  // 顾客端折扣文案：菜品折扣以“支付百分比”入库（90=按原价90%结算），
  // 展示时换算为常用说法：90 → 9折，85 → 8.5折
  formatCustomDiscountLabel(p) {
    if (!(p > 0 && p < 100)) return ''
    const d = Math.round(p / 10 * 100) / 100
    return String(d).replace(/\.0+$/, '')
  },

  // 订单中是否存在非默认95折的菜品（关闭95折或设置全场自定义折扣）
  hasSpecialDishGoods() {
    return (this.data.orderGoods || []).some(g =>
      g.noMemberDiscount || (Number(g.customDiscount) > 0 && Number(g.customDiscount) < 100)
    )
  },

  // 菜品余额支付实际折扣率：参与95折的取「自定义折扣」与默认95折中更优惠者（不叠加）；
  // 不参与95折的只保留自定义折扣；两者皆无则按原价
  getMemberRate(g, defaultRate) {
    const p = Number(g.customDiscount)
    const customRate = (p > 0 && p < 100) ? Math.max(0.01, Math.min(0.99, p / 100)) : 1
    const memberRate = g.noMemberDiscount ? 1 : (defaultRate || 0.95)
    return Math.min(customRate, memberRate)
  },

  // 菜品微信支付折扣率：仅全场自定义折扣对所有用户生效，无则按原价
  getWxRate(g) {
    const p = Number(g.customDiscount)
    if (p > 0 && p < 100) return Math.max(0.01, Math.min(0.99, p / 100))
    return 1
  },

  // 微信支付商品折后总额（逐菜品自定义折扣，无折扣菜品原价）
  calcWxGoodsTotal() {
    const goods = this.data.orderGoods || []
    return goods.reduce((sum, g) => Math.round((sum + (Number(g.wxSubtotal) || 0)) * 100) / 100, 0)
  },

  // 会员余额支付优惠金额：逐菜品按各自实际折扣让利
  //（参与95折的与全场自定义折扣取更优惠；关闭95折的仅自定义折扣或无折扣）
  calcBalanceDiscount(totalPay) {
    const defaultRate = this.data.balanceDiscountRate || 1
    if (!this.hasSpecialDishGoods()) {
      // 整单全部按店铺默认95折，与原逻辑一致
      return Math.round(totalPay * (1 - defaultRate) * 100) / 100
    }
    let savings = 0
    const goods = this.data.orderGoods || []
    goods.forEach(g => {
      const amount = Math.round(((g.price || 0) * (g.count || 1)) * 100) / 100
      if (amount <= 0) return
      const rate = this.getMemberRate(g, defaultRate)
      savings = Math.round((savings + amount * (1 - rate)) * 100) / 100
    })
    // 配送费部分按店铺默认折扣计算（与原整单95折逻辑一致）
    const fee = this.getChargeFee()
    if (fee > 0) savings = Math.round((savings + fee * (1 - defaultRate)) * 100) / 100
    // 优惠券先行抵扣的金额不再计入折让基数（与原逻辑一致）
    const coupon = this.data.couponDiscount || 0
    if (coupon > 0) savings = Math.round(Math.max(0, savings - coupon * (1 - defaultRate)) * 100) / 100
    return Math.max(0, Math.round(savings * 100) / 100)
  },

  // 余额支付折后应付金额（关闭95折且无自定义折扣的菜品按原价计入；自定义折扣与95折取更优惠）
  calcBalanceDiscountedTotal(totalPay) {
    const defaultRate = this.data.balanceDiscountRate || 1
    if (!this.hasSpecialDishGoods()) {
      // 整单全部按店铺默认95折，与原逻辑一致
      return Math.round(totalPay * defaultRate * 100) / 100
    }
    const discount = this.calcBalanceDiscount(totalPay)
    return Math.max(0, Math.round((totalPay - discount) * 100) / 100)
  },

  updateFinalPrice(payMethod) {
    const { totalPrice, couponDiscount, userBalance } = this.data
    let groupBuyDiscount = this.data.groupBuyDiscount || 0
    let basePrice = totalPrice - couponDiscount - groupBuyDiscount
    if (basePrice < 0) basePrice = 0
    let totalPay = basePrice + this.getChargeFee()

    // 菜品自定义折扣对所有用户/支付方式生效；余额支付的95折与自定义折扣取更优惠不叠加
    let balanceDiscount = 0
    let wxDiscount = 0
    let wxOriginalTotal = totalPay   // 微信支付未折前的原应付（含券/配送费）
    let discountedTotalPay = totalPay
    if (payMethod === 'wechat') {
      // 微信支付：仅菜品自定义折扣生效（无折扣菜品按原价）
      const wxGoods = this.calcWxGoodsTotal()
      wxDiscount = Math.max(0, Math.round((totalPrice - wxGoods) * 100) / 100)
      discountedTotalPay = Math.max(0, Math.round((wxGoods - couponDiscount - groupBuyDiscount) * 100) / 100) + this.getChargeFee()
    } else if (userBalance > 0 && (payMethod === 'balance' || payMethod === 'mix')) {
      // 余额/混合支付：95折与菜品自定义折扣取更优惠（不叠加），不参与折扣菜品按原价
      balanceDiscount = this.calcBalanceDiscount(totalPay)
      discountedTotalPay = this.calcBalanceDiscountedTotal(totalPay)
    }

    let balancePay = 0
    let wechatPay = 0

    if (payMethod === 'balance') {
      balancePay = discountedTotalPay
      wechatPay = 0
    } else if (payMethod === 'wechat') {
      balancePay = 0
      wechatPay = discountedTotalPay
    } else if (payMethod === 'mix') {
      balancePay = userBalance
      wechatPay = discountedTotalPay - userBalance
      if (wechatPay < 0) wechatPay = 0
    }

    this.setData({
      payMethod,
      finalPrice: basePrice,
      displayTotal: discountedTotalPay,
      balancePayAmount: balancePay,
      wechatPayAmount: wechatPay,
      balanceDiscount: balanceDiscount,
      balanceDiscountedTotal: discountedTotalPay,
      wxDiscount: wxDiscount,
      wxOriginalTotal: wxOriginalTotal
    })
  },

  updatePayMethod() {
    const { userBalance, payMethod } = this.data

    // 保持用户已选择的支付方式，避免切换优惠券/配送方式后重置用户选择
    if (payMethod === 'wechat') {
      this.updateFinalPrice('wechat')
      return
    }
    if (payMethod === 'mix') {
      // 余额为0时混合支付无意义，直接使用微信支付（不享受95折）
      if (userBalance <= 0) {
        this.updateFinalPrice('wechat')
        return
      }
      this.updateFinalPrice('mix')
      return
    }

    if (userBalance > 0) {
      // 有会员卡（已充值）→ 优先选择余额支付
      this.updateFinalPrice('balance')
    } else {
      // 没有会员卡（未充值）→ 默认微信支付
      this.updateFinalPrice('wechat')
    }
  },

  switchDeliveryType() {
    if (this.data.isDiyOrder) {
      wx.showToast({ title: 'DIY套餐为外卖配送，配送费按距离计算', icon: 'none' })
      return
    }
    const newType = this.data.deliveryType === 'dineIn' ? 'takeout' : 'dineIn'
    this.setData({
      deliveryType: newType,
      selectedAddress: newType === 'dineIn' ? null : this.data.selectedAddress,
      deliveryFee: newType === 'dineIn' ? 0 : this.data.deliveryFee
    })
    if (newType === 'takeout' && this.data.selectedAddress) this.calcDeliveryFee()
    this.updateFinalPriceWithCoupon()
    this.updateCanSubmit()
    wx.showToast({ title: newType === 'dineIn' ? '已切换至堂食/自取' : '已切换至外卖配送', icon: 'success', duration: 1500 })
  },

  onRemarkInput(e) { this.setData({ remark: e.detail.value }) },

  async notifyAdminNewOrder(orderId, totalPrice, goodsList, remark, deliveryAddress) {
    try {
      await wx.cloud.callFunction({
        name: 'sendNewOrderNoticeToAdmin',
        data: { orderId, totalPrice, goodsList, remark, deliveryAddress, selectedTime: this.data.selectedTime, deliveryType: this.data.deliveryType }
      })
    } catch (err) { console.error('通知商家失败', err) }
  },

  // 触发打印机打印订单（模拟支付/纯余额支付等不走微信回调的场景）
  async triggerPrint(orderId) {
    try {
      const printerRes = await db.collection('printer').limit(1).get()
      if (!printerRes.data || printerRes.data.length === 0) return

      const orderRes = await db.collection('order').doc(orderId).get()
      if (!orderRes.data || orderRes.data.type !== 'order') return

      const order = orderRes.data
      const sn = printerRes.data[0].sn
      const shopRes = await db.collection('shopinfo').limit(1).get()
      const shopName = shopRes.data[0]?.name || '餐饮店'

      // 生成打印内容（使用后台订单管理的同款格式）
      const content = this.generatePrintContent(order, shopName)
      const voice = order.orderType === 'dineIn' ? '16' : '19'

      const printRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'printNote',
          sn, voice, voicePlayTimes: 1, voicePlayInterval: 3,
          content, copies: 1, expiresInSeconds: 7200, outTradeNo: orderId
        }
      })
      if (printRes.result && printRes.result.success) {
        console.log('自动打印成功', printRes.result)
      } else {
        console.error('自动打印失败', printRes.result)
      }
    } catch (err) {
      console.error('自动打印异常', err)
    }
  },

  // 生成打印内容（与后台重新打印使用相同格式）
  generatePrintContent(order, shopName) {
    const date = new Date(order.createTime)
    let content = `<C>${shopName}</C><BR>`
      + `<C>订单小票</C><BR>`
      + `<LEFT>订单号：${order._id}</LEFT><BR>`
      + `<LEFT>时间：${date.toLocaleString()}</LEFT><BR>`
      + `<C>--------------------------------</C><BR>`
      + `<C>菜品名称${' '.repeat(8)}数量${' '.repeat(4)}单价</C><BR>`
    if (order.goodsList && order.goodsList.length) {
      order.goodsList.forEach(item => {
        const name = item.dishName.length > 12 ? item.dishName.slice(0, 10) + '..' : item.dishName
        const price = (item.price || 0).toFixed(2)
        const count = item.count
        content += `<LEFT>${name}${' '.repeat(12 - name.length)}${count}${' '.repeat(8)}￥${price}</LEFT><BR>`
      })
    }
    content += `<C>--------------------------------</C><BR>`
      + `<RIGHT>合计：￥${order.finalPrice.toFixed(2)}</RIGHT><BR>`
      + `<C>感谢惠顾！</C><BR>`
      + `<C>欢迎下次光临</C><BR>`
    return content
  },

  // ========== 抽奖弹窗 ==========
  async showRewardPopup() {
    try {
      const { totalPrice, freeLotteryThreshold } = this.data
      let hasChance = false
      let popupText = ''

      if (freeLotteryThreshold > 0 && totalPrice >= freeLotteryThreshold) {
        const chanceRes = await wx.cloud.callFunction({ name: 'addLotteryChance', data: {} })
        hasChance = chanceRes.result && chanceRes.result.code === 0
        popupText = '获得一次免费抽奖机会！'
        if (hasChance) console.log('已达到抽奖门槛，赠送一次抽奖机会')
      } else {
        popupText = '感谢您的光临！'
      }

      const configRes = await db.collection('config').doc('config').get()
      let imageUrl = ''
      const fileID = configRes.data.rewardPopupImage
      if (fileID) {
        const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (urlRes.fileList.length) imageUrl = urlRes.fileList[0].tempFileURL
      }

      if (imageUrl) {
        this.setData({
          rewardPopupImage: imageUrl,
          rewardPopupText: popupText,
          showRewardPopup: true
        })
      } else if (hasChance) {
        wx.showModal({
          title: '恭喜',
          content: popupText,
          showCancel: false,
          confirmText: '去抽奖',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.redirectTo({ url: '/pages/lottery/lottery' })
            } else {
              wx.switchTab({ url: '/pages/index/index' })
            }
          }
        })
      } else {
        wx.showToast({ title: '订单支付成功', icon: 'success', duration: 1500 })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1500)
      }
    } catch (err) { console.error(err) }
  },

  // 支付成功后弹窗按钮：直接跳转抽奖页面（替换当前页，返回时直接回到首页）
  goToLotteryFromPopup() {
    this.setData({ showRewardPopup: false })
    wx.redirectTo({ url: '/pages/lottery/lottery' })
  },

  // 点击弹窗其他位置（遮罩/取消按钮）→ 返回点餐首页
  closeRewardAndGoHome() {
    this.setData({ showRewardPopup: false })
    wx.switchTab({ url: '/pages/index/index' })
  },

  async checkAndSubmit() {
    console.log('checkAndSubmit called')
    const { submitting, canSubmit, totalPrice, freeLotteryThreshold, deliveryType, selectedAddress, minDeliveryAmount, userInfo } = this.data
    console.log('submitting:', submitting, 'canSubmit:', canSubmit, 'totalPrice:', totalPrice)

    // 防重复提交
    if (submitting) { console.log('blocked by submitting'); return }

    // 前置条件校验
    if (!canSubmit) {
      console.log('blocked by canSubmit=false')
      if (deliveryType === 'takeout' && !selectedAddress) {
        wx.showToast({ title: '请选择收货地址', icon: 'none' })
      } else if (!this.data.orderGoods || !this.data.orderGoods.length) {
        wx.showToast({ title: '购物车为空', icon: 'none' })
      } else {
        wx.showToast({ title: '请完善订单信息', icon: 'none' })
      }
      return
    }

    // 强制登录检查：未登录弹窗引导登录
    if (!userInfo || !userInfo.phoneNumber) {
      console.log('show login modal, userInfo:', JSON.stringify(userInfo))
      this.setData({ showAuthModal: true })
      return
    }

    console.log('userInfo ok, deliveryType:', deliveryType, 'minDeliveryAmount:', minDeliveryAmount, 'freeLotteryThreshold:', freeLotteryThreshold)
    if (!this.data.selectedTime || this.data.selectedTime.trim() === '') {
      const timeLabel = this.data.deliveryType === 'dineIn' ? '取餐时间' : '配送时间'
      wx.showToast({ title: `请选择${timeLabel}`, icon: 'none' })
      return
    }

    if (deliveryType === 'takeout' && minDeliveryAmount > 0 && totalPrice < minDeliveryAmount) {
      console.log('below min delivery')
      wx.showToast({ title: `本店满${minDeliveryAmount}元起送，当前商品总额${totalPrice}元`, icon: 'none' })
      return
    }
    if (freeLotteryThreshold > 0 && totalPrice < freeLotteryThreshold) {
      console.log('show lottery modal')
      const need = (freeLotteryThreshold - totalPrice).toFixed(2)
      wx.showModal({
        title: '凑单提醒',
        content: `还差${need}元即可获得一次免费抽奖机会，是否去凑单？`,
        confirmText: '直接结算',
        cancelText: '去凑单',
        success: (res) => {
          console.log('lottery modal result:', res)
          if (res.confirm) {
            this.submitOrder()
          } else {
            wx.switchTab({ url: '/pages/index/index' })
          }
        }
      })
    } else {
      console.log('calling submitOrder directly')
      this.submitOrder()
    }
  },

  async submitOrder() {
    console.log('submitOrder called, submitting:', this.data.submitting, 'canSubmit:', this.data.canSubmit, 'shopIsOpen:', this.data.shopIsOpen)
    if (this.data.submitting) { console.log('submitOrder blocked: submitting'); return }
    if (!this.data.canSubmit) {
      console.log('submitOrder blocked: !canSubmit')
      wx.showToast({ title: '请完善订单信息', icon: 'none' })
      return
    }

    if (!this.data.shopIsOpen) {
      console.log('submitOrder blocked: shop is closed')
      wx.showModal({
        title: '店铺已打烊',
        content: '店铺当前已闭店，暂时无法下单，请稍后再来。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    console.log('submitOrder proceeding to create order...')

    const { deliveryType, selectedAddress, totalPrice,
            payMethod, orderGoods, userBalance, selectedCoupon, couponDiscount, remark, minDeliveryAmount,
            selectedTime } = this.data

    // 使用 totalPrice（纯商品总额）作为基础计算应付款，避免 finalPrice 可能已含配送费导致重复加
    let basePay = totalPrice - couponDiscount
    if (basePay < 0) basePay = 0
    let totalPay = basePay + this.getChargeFee()

    // 会员卡余额支付95折（需余额>0；与菜品自定义折扣取更优惠不叠加，不参与折扣菜品按原价）
    let balanceDiscount = 0
    if (userBalance > 0 && (payMethod === 'balance' || payMethod === 'mix')) {
      balanceDiscount = this.calcBalanceDiscount(totalPay)
      totalPay = this.calcBalanceDiscountedTotal(totalPay)
    } else if (payMethod === 'wechat') {
      // 微信支付：菜品自定义折扣对所有用户生效
      const wxGoods = this.calcWxGoodsTotal()
      totalPay = Math.max(0, Math.round((wxGoods - couponDiscount) * 100) / 100) + this.getChargeFee()
    }

    if (totalPay < 0) {
      wx.showToast({ title: '订单金额异常', icon: 'none' })
      return
    }

    if (deliveryType === 'takeout') {
      if (minDeliveryAmount > 0 && totalPrice < minDeliveryAmount) {
        wx.showToast({ title: `本店满${minDeliveryAmount}元起送，当前商品总额${totalPrice}元`, icon: 'none' })
        return
      }
    }
    if (deliveryType === 'takeout' && !selectedAddress) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }

    let finalBalancePay = 0
    let finalWechatPay = 0
    if (payMethod === 'balance') {
      finalBalancePay = totalPay
      finalWechatPay = 0
    } else if (payMethod === 'wechat') {
      finalBalancePay = 0
      finalWechatPay = totalPay
    } else {
      finalBalancePay = userBalance
      finalWechatPay = totalPay - userBalance
      if (finalWechatPay < 0) finalWechatPay = 0
    }

    if (finalBalancePay > 0 && userBalance < finalBalancePay) {
      wx.showModal({
        title: '余额不足',
          content: `您的余额为\u00a5${userBalance.toFixed(2)}，订单需支付\u00a5${totalPay.toFixed(2)}。是否使用余额支付\u00a5${userBalance.toFixed(2)}，剩余\u00a5${(totalPay - userBalance).toFixed(2)}使用微信支付？`,
        confirmText: '确定',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({ payMethod: 'mix' })
            this.updateFinalPrice('mix')
            // 重新提交
            this.submitOrder()
          }
        }
      })
      return
    }
      // 获取邀请人信息
    this.setData({ submitting: true })
    wx.showLoading({ title: '下单中...' })

    let orderId = null  // 在 try 外部声明，catch 块中可用于回退余额

    try {
      // 获取邀请人信息
      const inviterOpenid = app.globalData.inviterOpenid || wx.getStorageSync('inviterOpenid') || ''

      // 组装优惠券信息（商品券附带具体商品名，供订单详情展示）
      let couponName = ''
      let couponType = ''
      if (selectedCoupon) {
        couponName = selectedCoupon.name || ''
        couponType = selectedCoupon.type || ''
        if (selectedCoupon.type === 'product' && selectedCoupon.productId) {
          const goods = orderGoods.find(g => g.dishId === selectedCoupon.productId)
          if (goods) couponName = `${selectedCoupon.name}（${goods.dishName}）`
        }
      }

      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods, totalPrice, finalPrice: totalPay,
          useMiandan: false,
          payWithBalance: (payMethod === 'balance' || payMethod === 'mix'),
          orderType: deliveryType === 'takeout' ? 'takeout' : 'dineIn',
          tableNumber: '', deliveryFee: this.getChargeFee(),
          shippingAddress: deliveryType === 'takeout' ? selectedAddress : null,
          couponId: selectedCoupon ? selectedCoupon._id : null,
          couponName, couponType,
          couponSource: selectedCoupon ? (selectedCoupon.source || '') : '',
          couponDiscount, remark,
          selectedTime: selectedTime,
          balancePayAmount: finalBalancePay,
          wechatPayAmount: finalWechatPay,
          inviterOpenid: inviterOpenid,
          balanceDiscount: balanceDiscount,
          balanceOriginalTotal: totalPay + balanceDiscount
        }
      })
      if (!doBuyRes.result?.success) throw new Error(doBuyRes.result?.error || '下单失败')
      orderId = doBuyRes.result.orderId
      const outTradeNo = doBuyRes.result.outTradeNo   // 关键：唯一订单号
      this.clearCart()

      if (finalWechatPay > 0) {
        if (this.USE_MOCK_PAY) {
          wx.hideLoading()
          wx.showToast({ title: '下单成功', icon: 'success' })
          await this.showRewardPopup()
          // 走云函数推送（服务端发送，避免小程序端 wx.request 合法域名限制）
          this.notifyAdminNewOrder(orderId, totalPay, orderGoods, remark, selectedAddress)
          this.triggerPrint(orderId)
        } else {
          wx.hideLoading()
          wx.showLoading({ title: '拉起支付中...' })
          const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
          const payRes = await wx.cloud.callFunction({
            name: 'pay',
            data: {
              body: `点餐订单微信支付¥${finalWechatPay}`,
              outTradeNo: outTradeNo,                // 使用新订单号
              totalFee: finalWechatPay * 100,       // 元转分
            }
          })
          if (!payRes.result?.success) throw new Error(payRes.result.error || '支付下单失败')
          const payment = payRes.result.payment
          wx.hideLoading()
          try {
            await wx.requestPayment(payment)
            wx.showToast({ title: '支付成功', icon: 'success' })
            await this.showRewardPopup()
            // 微信支付成功后，企业微信通知由 pay_success 云函数异步发送，这里不再重复调用
          } catch (payErr) {
            // 用户取消支付或支付失败，回退已扣除的余额
            console.error('微信支付失败/取消', payErr)
            if (finalBalancePay > 0) {
              wx.showLoading({ title: '取消支付，退回余额...' })
              try {
                await wx.cloud.callFunction({
                  name: 'adminRefund',
                  data: { orderId: orderId }
                })
                // 立即刷新当前页面的余额显示
                this.loadUserInfo()
              } catch (refundErr) {
                console.error('退回余额失败', refundErr)
              }
              wx.hideLoading()
            }
            wx.showToast({ title: payErr.errMsg?.includes('cancel') ? '已取消支付，余额已退回' : '支付失败', icon: 'none' })
          }
        }
      } else {
        wx.hideLoading()
        wx.showToast({ title: '下单成功', icon: 'success' })
        await this.showRewardPopup()
        // 纯余额支付：走云函数推送（与微信支付回调一致，服务端发送，不受小程序 request 合法域名限制）
        this.notifyAdminNewOrder(orderId, totalPay, orderGoods, remark, selectedAddress)
        this.triggerPrint(orderId)
      }
    } catch (err) {
      console.error('下单失败', err)
      wx.hideLoading()
      // 如果订单已创建（余额已扣），但后续流程失败，回退余额
      if (orderId !== null && finalBalancePay > 0 && err.message !== '下单失败') {
        try {
          await wx.cloud.callFunction({
            name: 'adminRefund',
            data: { orderId: orderId }
          })
          this.loadUserInfo()
          wx.showToast({ title: '支付失败，余额已退回', icon: 'none' })
        } catch (_) {
          wx.showToast({ title: err.message || '下单失败', icon: 'none' })
        }
      } else {
        wx.showToast({ title: err.message || '下单失败', icon: 'none' })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  editOrder() { wx.navigateBack() },

  clearCart() {
    const pages = getCurrentPages()
    const indexPage = pages.find(p => p.route === 'pages/index/index')
    if (indexPage && indexPage.updateCart) indexPage.updateCart({})
  },

  stopPropagation() {},

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ title: '订单结算 - 餐饮点餐', path: '/pages/settle/settle' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ title: '订单结算 - 餐饮点餐' })
  }
})