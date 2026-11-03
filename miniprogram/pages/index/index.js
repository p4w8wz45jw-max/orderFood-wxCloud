// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    menuList: [],
    currentMenuId: '',
    goodsList: [],
    cart: {},
    cartCount: 0,
    cartTotalPrice: 0,
    cartTotalPriceText: '0.00',
    showCart: false,
    userInfo: null,
    noticeList: [],
    noticeText: '',
    shopInfo: {},
    showTagModal: false,
    currentDish: null,
    selectedTags: {},
    modalDishCount: 1,
    modalTotalPrice: 0,
    showAuthModal: false,
    statusBarHeight: 0,
    goodsPage: 0,
    goodsPageSize: 20,
    goodsHasMore: true,
    goodsLoading: false,
    orderMode: 'dineIn',
    themeColor: '#B8956E',
    carouselImages: [],
    contentHeight: 500,
    windowHeight: 0,
    searchKeyword: '',
    searchResults: [],
    searched: false,
    searchContentHeight: 500,
    newUserGiftConfig: null,
    showNewUserGiftBanner: false,
    isOldUserForGift: false,
    pendingNewUserGift: false,
    balanceDiscountRate: 1  // 会员价折扣（已取消95折，1=无折扣）
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 0,
      themeColor: app.globalData.themeColor || '#B8956E',
      windowHeight: systemInfo.windowHeight
    })
    const mode = app.globalData.orderMode || options.mode || 'dineIn'
    this.setData({ orderMode: mode })
    
    // 处理邀请参数：从分享卡片进入时记录邀请人
    if (options.inviter && options.inviter !== app.globalData.openid) {
      app.globalData.inviterOpenid = options.inviter
      wx.setStorageSync('inviterOpenid', options.inviter)
    }
    
    this.loadShopInfo()
    this.loadMenu()
    this.loadUserInfo().then(() => this.loadNewUserGiftConfig())
    this.loadNotices()
    this.loadCarouselImages()
  },

  onReady() {
    // 准备分享卡：Canvas 已挂载，异步画一张品牌海报缓存本地
    if (!app.globalData.shareCardPath) {
      const shopName = (this.data.shopInfo && this.data.shopInfo.name) || app.globalData.shopName || '美食在线'
      app.globalData.shopName = shopName
      require('../../utils/shareCard.js').getShareCardPath({ type: 'brand', shopName: shopName, slogan: '新鲜现做' }).then((p) => {
        if (p) app.globalData.shareCardPath = p
      })
    }

    // 动态计算主内容区高度，确保scroll-view恰好在可视范围内
    const { windowHeight, statusBarHeight } = wx.getSystemInfoSync()
    const query = wx.createSelectorQuery().in(this)
    query.select('.main-content').boundingClientRect()
    query.exec(res => {
      if (!res || !res[0]) return
      // main-content 顶部距屏幕顶部的距离（含状态栏）
      const top = res[0].top || 0
      // 底部留出悬浮购物车高度（约 120rpx ≈ 60px）+ 安全间距
      const cartBuffer = 80
      const contentHeight = Math.max(300, windowHeight - top - cartBuffer)
      this.setData({ contentHeight: contentHeight })
      console.log('内容区高度:', contentHeight, 'top:', top, 'windowHeight:', windowHeight)
    })
    // 搜索区域也独立计算高度
    const searchQuery = wx.createSelectorQuery().in(this)
    searchQuery.select('.search-wrapper').boundingClientRect()
    searchQuery.exec(res => {
      if (!res || !res[0]) return
      const searchTop = res[0].top || 0
      const searchH = res[0].height || 0
      const searchContentHeight = Math.max(300, windowHeight - searchTop - searchH - 80)
      this.setData({ searchContentHeight: searchContentHeight })
    })
  },

  onShow() {
    const mode = app.globalData.orderMode || 'dineIn'
    this.setData({
      orderMode: mode,
      themeColor: app.globalData.themeColor || '#B8956E'
    })
    this.loadUserInfo().then(() => this.loadNewUserGiftConfig())
    // 检查是否有待使用的商品券
    this.checkPendingCoupon()
  },

  // 检查从优惠券页面带来的商品券，自动加购
  async checkPendingCoupon() {
    try {
      const pendingCoupon = wx.getStorageSync('pendingCoupon')
      if (!pendingCoupon) return
      wx.removeStorageSync('pendingCoupon')
      
      // 只处理商品券类型
      if (pendingCoupon.type !== 'product' || !pendingCoupon.productId) {
        // 非商品券：仅存储选中优惠券供结算页使用
        wx.setStorageSync('selectedCoupon', pendingCoupon)
        return
      }
      
      // 商品券：查找对应菜品并自动加购
      wx.showLoading({ title: '加载中...' })
      const db = wx.cloud.database()
      const res = await db.collection('dish').doc(pendingCoupon.productId).get()
      wx.hideLoading()
      
      if (!res.data) {
        wx.showToast({ title: '商品券对应菜品已下架', icon: 'none' })
        return
      }
      
      const goods = res.data
      // 设置会员价
      goods.memberPrice = this.calcMemberPrice(goods.price)
      // 存储优惠券供结算页使用
      wx.setStorageSync('selectedCoupon', pendingCoupon)
      
      // 如果菜品有标签选项，弹出标签选择弹窗
      if (goods.tags && goods.tags.length > 0) {
        const selectedTags = {}
        goods.tags.forEach(tag => {
          if (tag.type === 'multiple' || tag.type === 'pick') selectedTags[tag.id] = []
        })
        this.setData({
          showTagModal: true,
          currentDish: goods,
          selectedTags: selectedTags,
          modalDishCount: 1,
          modalTotalPrice: (Math.round(goods.price * 100) / 100).toFixed(2)
        })
        return
      }
      
      // 无标签选项：直接加入购物车
      const cart = { ...this.data.cart }
      const cartKey = goods._id
      if (cart[cartKey]) {
        cart[cartKey].count++
      } else {
        cart[cartKey] = { info: goods, count: 1, tags: {}, tagLabels: [], dishId: goods._id }
      }
      this.updateCart(cart)
      wx.showToast({ title: `已添加[${goods.name}]到购物车`, icon: 'success', duration: 2000 })
    } catch (err) {
      console.error('处理商品券失败', err)
    }
  },

  async loadShopInfo() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data && res.data.length > 0) {
        console.log('读取到店铺信息：', res.data[0])
        this.setData({ shopInfo: res.data[0] })
      }
    } catch (err) {
      console.error('加载店铺信息失败', err)
    }
  },

  async loadUserInfo() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({ _openid: openid }).get()
      if (res.data && res.data.length > 0) {
        const user = res.data[0]
        if (typeof user.balance === 'undefined') {
          await db.collection('user').doc(user._id).update({ data: { balance: 0 } })
          user.balance = 0
        }
        this.setData({ userInfo: user })
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },

  async loadNewUserGiftConfig() {
    // 所有用户都显示赠礼横幅，老用户点击时提示无法领取
    try {
      // 通过云函数读取（绕过前端权限限制）
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'get', collection: 'config', docId: 'new_user_gift' }
      })
      if (res.result && res.result.success && res.result.data && res.result.data.enable && res.result.data.couponId) {
        const giftConfig = res.result.data
        // 也通过云函数读取优惠券
        const couponRes = await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'get', collection: 'coupon', docId: giftConfig.couponId }
        })
        if (couponRes.result && couponRes.result.success && couponRes.result.data) {
          const coupon = couponRes.result.data
          const userInfo = this.data.userInfo
          const isOldUser = !!(userInfo && userInfo.phoneNumber)
          this.setData({
            newUserGiftConfig: {
              ...giftConfig,
              couponName: coupon.name,
              couponType: coupon.type,
              condition: coupon.condition,
              value: coupon.value,
              discount: coupon.discount,
              productName: coupon.productName
            },
            showNewUserGiftBanner: true,
            isOldUserForGift: isOldUser
          })
          return
        }
      }
    } catch (err) {
      console.log('加载新用户赠礼配置失败', err)
    }
    this.setData({ showNewUserGiftBanner: false, newUserGiftConfig: null, isOldUserForGift: false })
  },

  onNewUserGiftTap() {
    const userInfo = this.data.userInfo
    // 老用户（已注册）：直接提示无法领取
    if (userInfo && userInfo.phoneNumber) {
      wx.showToast({ title: '您已是老用户，该福利仅限新用户领取', icon: 'none', duration: 2500 })
      return
    }
    // 新用户：弹出授权弹窗
    this.setData({ pendingNewUserGift: true, showAuthModal: true })
  },

  async doNewUserGift() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'newUserGift',
        data: {}
      })
      if (res.result && res.result.success) {
        const coupon = res.result.coupon
        let msg = '领取成功！获得'
        if (coupon.type === 'full_reduction') {
          msg += `满${coupon.condition}减${coupon.value}优惠券`
        } else if (coupon.type === 'discount') {
          msg += `${coupon.discount}折优惠券`
        } else {
          msg += `商品券：${coupon.productName || ''}`
        }
        wx.showToast({ title: msg, icon: 'success', duration: 3000 })
        this.setData({ showNewUserGiftBanner: false, newUserGiftConfig: null, isOldUserForGift: false })
      } else if (res.result && res.result.alreadyReceived) {
        this.setData({ showNewUserGiftBanner: false, newUserGiftConfig: null, isOldUserForGift: false })
      }
    } catch (err) {
      console.error('新用户赠礼发放失败', err)
    }
  },

  async loadNotices() {
    try {
      const res = await db.collection('notice')
        .where({ status: 1 })
        .orderBy('sort', 'asc')
        .limit(10)
        .get()
      const noticeText = res.data.map(item => item.content).join('    ')
      this.setData({ noticeList: res.data || [], noticeText: noticeText })
    } catch (err) {
      console.error('加载公告失败', err)
    }
  },

  async loadCarouselImages() {
    try {
      const res = await db.collection('config').doc('config').get()
      if (res.data && res.data.carouselImages && res.data.carouselImages.length > 0) {
        this.setData({ carouselImages: res.data.carouselImages })
      }
    } catch (err) {
      console.error('加载轮播图失败', err)
    }
  },

  async loadMenu(showLoading = true) {
    if (showLoading) wx.showLoading({ title: '加载中...' })
    try {
      console.log('开始加载分类，调用云函数 getCategory...')
      const res = await wx.cloud.callFunction({ name: 'getCategory' })
      console.log('云函数返回:', JSON.stringify(res.result))
      const result = res.result || {}
      const list = result.success ? (result.data || []) : []
      console.log('分类列表长度:', list.length)
      if (list.length > 0) {
        const firstId = list[0]._id
        this.setData({ menuList: list, currentMenuId: firstId, goodsPage: 0, goodsHasMore: true })
        this.loadGoods(firstId, false, false)
      } else {
        // 分类为空时，尝试直接加载所有菜品（不限分类）
        this.tryLoadAllGoods()
      }
    } catch (err) {
      console.error('加载菜品分类失败', err)
      // 云函数调用失败时，也尝试直接加载所有菜品
      this.tryLoadAllGoods()
    } finally {
      if (showLoading) wx.hideLoading()
    }
  },

  // 兜底：无分类时直接加载所有在售菜品
  async tryLoadAllGoods() {
    console.log('进入兜底加载，直接查询 dish 集合...')
    try {
      const goodsRes = await db.collection('dish')
        .where({ status: 1 })
        .orderBy('sort', 'asc')
        .limit(100)
        .get()
      const list = (goodsRes.data || []).map(goods => {
        goods.cartCount = 0
        goods.memberPrice = this.calcMemberPrice(goods.price, goods)
        return goods
      })
      this.setData({ goodsList: list })
      if (list.length === 0) {
        wx.showToast({ title: '暂无菜品，请在管理后台添加', icon: 'none', duration: 3000 })
      }
    } catch (err) {
      console.error('直接加载菜品也失败', err)
      wx.showToast({ title: '加载失败，请检查网络或云函数部署', icon: 'none', duration: 3000 })
    }
  },

  // 菜品实际会员折扣率：不参与=null，自定义(1-99)>0 按自定义，其余按店铺默认折扣（已取消95折=无折扣）
  calcMemberRateForGoods(goods) {
    if (!goods) return this.data.balanceDiscountRate || 1
    if (goods.noMemberDiscount) return null
    const custom = Number(goods.customDiscount)
    if (custom > 0 && custom < 100) return Math.max(0.01, Math.min(0.99, custom / 100))
    return this.data.balanceDiscountRate || 1
  },

  // 计算会员价（按菜品自身折扣；不参与或无折扣的菜品返回 null 不展示会员价）
  calcMemberPrice(price, goods) {
    if (!price && price !== 0) return null
    const rate = this.calcMemberRateForGoods(goods)
    if (!rate || rate >= 1) return null
    return (Math.round(price * rate * 100) / 100).toFixed(2)
  },

  async loadGoods(menuId, append = false, showLoading = true) {
    if (!menuId || this.data.goodsLoading) return
    if (!append && showLoading) wx.showLoading({ title: '加载中...' })
    this.setData({ goodsLoading: true })
    try {
      const pageSize = this.data.goodsPageSize
      const page = append ? this.data.goodsPage + 1 : 0
      const skip = page * pageSize
      const goodsRes = await db.collection('dish')
        .where({ categoryId: menuId, status: 1 })
        .orderBy('sort', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()
      const list = goodsRes.data || []
      const mapped = list.map(goods => {
        goods.cartCount = this.getDishCartCount(goods._id)
        goods.memberPrice = this.calcMemberPrice(goods.price, goods)
        return goods
      })
      this.setData({
        goodsList: append ? this.data.goodsList.concat(mapped) : mapped,
        goodsPage: page,
        goodsHasMore: list.length === pageSize
      })
    } catch (err) {
      console.error('加载菜品失败', err)
      if (showLoading) wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (!append && showLoading) wx.hideLoading()
      this.setData({ goodsLoading: false })
    }
  },

  switchMenu(e) {
    const menuId = e.currentTarget.dataset.id
    this.setData({ currentMenuId: menuId, goodsPage: 0, goodsHasMore: true, goodsList: [] })
    this.loadGoods(menuId)
  },

  addToCart(e) {
    const goods = e.currentTarget.dataset.goods
    const selectedTags = {}
    if (goods.tags && goods.tags.length > 0) {
      goods.tags.forEach(tag => {
        if (tag.type === 'multiple' || tag.type === 'pick') selectedTags[tag.id] = []
      })
    }
    // 设置会员价（按菜品自身折扣）
    if (!goods.memberPrice) {
      goods.memberPrice = this.calcMemberPrice(goods.price, goods)
    }
    this.setData({
      showTagModal: true,
      currentDish: goods,
      selectedTags: selectedTags,
      modalDishCount: 1,
      modalTotalPrice: (Math.round(goods.price * 100) / 100).toFixed(2)
    })
  },

  confirmAddToCart() {
    const { currentDish, selectedTags, modalDishCount } = this.data
    const cart = this.data.cart
    if (currentDish.tags && currentDish.tags.length > 0) {
      for (let tag of currentDish.tags) {
        if (tag.required || tag.type === 'pick') {
          const selectedValue = selectedTags[tag.id]
          if (!selectedValue || (Array.isArray(selectedValue) && selectedValue.length === 0)) {
            wx.showToast({ title: `请选择${tag.name}`, icon: 'none' })
            return
          }
          // pick类型校验选中数量
          if (tag.type === 'pick' && Array.isArray(selectedValue) && tag.pickCount) {
            if (selectedValue.length !== tag.pickCount) {
              wx.showToast({ title: `请选择${tag.pickCount}项${tag.name}`, icon: 'none' })
              return
            }
          }
        }
      }
    }
    const cartKey = this.generateCartKey(currentDish._id, selectedTags)
    const tagLabels = []
    if (currentDish.tags && currentDish.tags.length > 0) {
      for (let tagId in selectedTags) {
        const tag = currentDish.tags.find(t => t.id === tagId)
        if (tag) {
          const value = selectedTags[tagId]
          if (Array.isArray(value)) tagLabels.push(...value)
          else tagLabels.push(value)
        }
      }
    }
    if (cart[cartKey]) {
      cart[cartKey].count += modalDishCount
    } else {
      cart[cartKey] = {
        info: currentDish,
        count: modalDishCount,
        tags: { ...selectedTags },
        tagLabels: tagLabels,
        dishId: currentDish._id
      }
    }
    this.updateCart(cart)
    this.closeTagModal()
  },

  generateCartKey(dishId, tags) {
    if (!tags || Object.keys(tags).length === 0) return dishId
    const tagStr = Object.keys(tags).sort().map(key => {
      const val = tags[key]
      return `${key}:${Array.isArray(val) ? val.sort().join(',') : val}`
    }).join('|')
    return `${dishId}_${tagStr}`
  },

  getDishCartCount(dishId, cart) {
    const cartData = cart !== undefined ? cart : this.data.cart
    let totalCount = 0
    for (let cartKey in cartData) {
      if (cartData[cartKey] && cartData[cartKey].dishId === dishId) totalCount += cartData[cartKey].count || 0
    }
    return totalCount
  },

  addDishToCartDirect(e) {
    const goods = e.currentTarget.dataset.goods
    if (!goods.tags || goods.tags.length === 0) {
      const cart = { ...this.data.cart }
      const cartKey = goods._id
      if (cart[cartKey]) cart[cartKey].count++
      else cart[cartKey] = { info: goods, count: 1, tags: {}, tagLabels: [], dishId: goods._id }
      this.updateCart(cart)
      wx.showToast({ title: '已添加', icon: 'success', duration: 1000 })
    } else {
      this.addToCart(e)
    }
  },

  reduceDishFromCart(e) {
    const goods = e.currentTarget.dataset.goods
    const cart = { ...this.data.cart }
    const cartKey = goods._id
    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) delete cart[cartKey]
      this.updateCart(cart)
    } else {
      for (let key in cart) {
        if (cart[key] && cart[key].dishId === goods._id) {
          cart[key].count--
          if (cart[key].count <= 0) delete cart[key]
          this.updateCart(cart)
          break
        }
      }
    }
  },

  reduceFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }
    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) delete cart[cartKey]
    }
    this.updateCart(cart)
  },

  addToCartFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }
    if (cart[cartKey]) cart[cartKey].count++
    this.updateCart(cart)
  },

  selectTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    const selectedTags = { ...this.data.selectedTags }
    selectedTags[tagId] = option
    this.setData({ selectedTags })
  },

  toggleTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    if (!tagId || !option) return
    const selectedTags = JSON.parse(JSON.stringify(this.data.selectedTags || {}))
    if (!selectedTags[tagId]) selectedTags[tagId] = []
    else if (!Array.isArray(selectedTags[tagId])) selectedTags[tagId] = [selectedTags[tagId]]
    const tagArray = [...selectedTags[tagId]]
    const index = tagArray.indexOf(option)
    if (index > -1) tagArray.splice(index, 1)
    else tagArray.push(option)
    selectedTags[tagId] = tagArray
    this.setData({ selectedTags })
  },

  pickTagOption(e) {
    const { tagId, option, max } = e.currentTarget.dataset
    if (!tagId || !option) return
    const maxPick = parseInt(max) || 1
    const selectedTags = JSON.parse(JSON.stringify(this.data.selectedTags || {}))
    let tagArray = selectedTags[tagId]
    if (!tagArray) tagArray = []
    if (!Array.isArray(tagArray)) tagArray = [tagArray]
    tagArray = [...tagArray]
    const index = tagArray.indexOf(option)
    if (index > -1) {
      tagArray.splice(index, 1)
    } else {
      if (tagArray.length >= maxPick) {
        tagArray.shift()  // 超过上限时移除最先选择的，实现替换效果
      }
      tagArray.push(option)
    }
    selectedTags[tagId] = tagArray
    this.setData({ selectedTags })
  },

  closeTagModal() {
    this.setData({
      showTagModal: false,
      currentDish: null,
      selectedTags: {},
      modalDishCount: 1,
      modalTotalPrice: 0
    })
  },

  increaseModalCount() {
    const newCount = this.data.modalDishCount + 1
    const price = this.data.currentDish ? this.data.currentDish.price : 0
    this.setData({ modalDishCount: newCount, modalTotalPrice: (Math.round(price * newCount * 100) / 100).toFixed(2) })
  },

  decreaseModalCount() {
    if (this.data.modalDishCount > 1) {
      const newCount = this.data.modalDishCount - 1
      const price = this.data.currentDish ? this.data.currentDish.price : 0
      this.setData({ modalDishCount: newCount, modalTotalPrice: (Math.round(price * newCount * 100) / 100).toFixed(2) })
    }
  },

  stopPropagation() {},

  previewDishImage(e) {
    const current = e.currentTarget.dataset.image
    const goodsList = e.currentTarget.dataset.images
    if (!current) return
    // 收集当前分类下所有菜品的图片
    const urls = [current]
    if (goodsList && goodsList.length) {
      goodsList.forEach(goods => {
        if (goods.image && goods.image !== current) {
          urls.push(goods.image)
        }
      })
    }
    wx.previewImage({
      current: current,
      urls: urls
    })
  },

  async onUserInfoSaved(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail || {}
    this.setData({
      userInfo: { ...(this.data.userInfo || {}), avatarUrl, nickName, phoneNumber },
      showAuthModal: false
    })
    try { await this.loadUserInfo() } catch (err) {}

    // 如果是从新用户赠礼横幅点击触发的，发放赠礼
    if (this.data.pendingNewUserGift) {
      this.setData({ pendingNewUserGift: false })
      await this.doNewUserGift()
      return
    }

    this.goToSettle()
  },

  async handleUserAuth(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail
    if (!phoneNumber) { wx.showToast({ title: '请先获取手机号', icon: 'none' }); return }
    try {
      wx.showLoading({ title: '授权中...' })
      const openid = app.globalData.openid
      const cloudPath = `avatar/${openid}_${Date.now()}.png`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: avatarUrl })
      const userRes = await db.collection('user').where({ _openid: openid }).get()
      const updateData = { avatarUrl: uploadRes.fileID, nickName, phoneNumber, updateTime: new Date() }
      if (userRes.data && userRes.data.length > 0) {
        await db.collection('user').doc(userRes.data[0]._id).update({ data: updateData })
      } else {
        await db.collection('user').add({ data: { ...updateData, balance: 0, createTime: new Date() } })
      }
      await this.loadUserInfo()
      this.setData({ showAuthModal: false })
      wx.hideLoading()
      wx.showToast({ title: '授权成功', icon: 'success' })
      setTimeout(() => this.goToSettle(), 500)
    } catch (err) {
      wx.hideLoading()
      console.error('授权失败', err)
      wx.showToast({ title: '授权失败，请重试', icon: 'none' })
    }
  },

  updateCart(cart) {
    let totalCount = 0, totalPrice = 0
    const cartCountMap = {}
    for (let cartKey in cart) {
      if (cart[cartKey] && cart[cartKey].info && cart[cartKey].count) {
        const count = cart[cartKey].count
        const dishId = cart[cartKey].dishId
        totalCount += count
        // 每次累加后四舍五入到分，防止浮点精度累积导致 toFixed 显示偏差
        totalPrice = Math.round((totalPrice + cart[cartKey].info.price * count) * 100) / 100
        cartCountMap[dishId] = (cartCountMap[dishId] || 0) + count
      }
    }
    // 仅更新 cartCount 变化的商品项，避免全量重建 goodsList
    const patchData = {}
    const goodsList = this.data.goodsList
    for (let i = 0; i < goodsList.length; i++) {
      const goods = goodsList[i]
      const newCount = cartCountMap[goods._id] || 0
      if (goods.cartCount !== newCount) {
        patchData[`goodsList[${i}].cartCount`] = newCount
      }
    }
    const setDataPayload = {
      cart, cartCount: totalCount, cartTotalPrice: totalPrice,
      cartTotalPriceText: totalPrice.toFixed(2),
      showCart: totalCount > 0 ? this.data.showCart : false
    }
    Object.assign(setDataPayload, patchData)
    this.setData(setDataPayload)
  },

  toggleCart() {
    if (this.data.cartCount === 0) return
    this.setData({ showCart: !this.data.showCart })
  },

  clearCart() {
    // 仅清零 cartCount，不透传 goodsList
    const goodsList = this.data.goodsList
    const patchData = {}
    for (let i = 0; i < goodsList.length; i++) {
      if (goodsList[i].cartCount !== 0) {
        patchData[`goodsList[${i}].cartCount`] = 0
      }
    }
    const setDataPayload = {
      cart: {}, cartCount: 0, cartTotalPrice: 0, cartTotalPriceText: '0.00',
      showCart: false
    }
    Object.assign(setDataPayload, patchData)
    this.setData(setDataPayload)
  },

  async goToSettle() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    // 检查店铺营业状态
    const shopInfo = this.data.shopInfo || {}
    if (shopInfo.isOpen === false) {
      wx.showModal({
        title: '店铺已打烊',
        content: '店铺当前已闭店，暂时无法下单，请稍后再来。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }
    this.navigateToSettle()
  },

  navigateToSettle() {
    try {
      wx.setStorageSync('settleCartData', {
        cart: this.data.cart,
        totalPrice: this.data.cartTotalPrice,
        orderMode: this.data.orderMode
      })
      wx.navigateTo({ url: '/pages/settle/settle' })
    } catch (err) {
      console.error('跳转结算页面失败', err)
      wx.showToast({ title: '跳转失败', icon: 'none' })
    }
  },

  async createOrder(options = {}) {
    const { payWithBalance = true } = options
    wx.showLoading({ title: '下单中...' })
    try {
      const openid = app.globalData.openid
      const orderGoods = []
      for (let cartKey in this.data.cart) {
        const item = this.data.cart[cartKey]
        let tagsArray = []
        if (item.tagLabels && Array.isArray(item.tagLabels)) tagsArray = item.tagLabels
        else if (item.tags && typeof item.tags === 'object') {
          Object.keys(item.tags).forEach(tagId => {
            const value = item.tags[tagId]
            if (Array.isArray(value)) tagsArray.push(...value)
            else if (value) tagsArray.push(value)
          })
        }
        orderGoods.push({
          dishId: item.dishId || item.info._id,
          dishName: item.info.name,
          dishImage: item.info.image,
          price: item.info.price,
          count: item.count,
          tags: tagsArray,
          canUseMiandan: item.info.canUseMiandan || false
        })
      }
      const miandanRes = await db.collection('freeBuy').where({ _openid: openid }).get()
      let useMiandan = false
      let finalPrice = this.data.cartTotalPrice
      if (miandanRes.data && miandanRes.data.length > 0 && miandanRes.data[0].count > 0) {
        const modalRes = await new Promise((resolve) => {
          wx.showModal({ title: '免单机会', content: `您有${miandanRes.data[0].count}次免单机会，是否使用？`, success: (res) => resolve(res) })
        })
        if (modalRes.confirm) { useMiandan = true; finalPrice = 0 }
      }
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods, totalPrice: this.data.cartTotalPrice, finalPrice,
          useMiandan, payWithBalance,
          orderType: this.data.orderMode,
          inviterOpenid: app.globalData.inviterOpenid || wx.getStorageSync('inviterOpenid') || ''
        }
      })
      if (!doBuyRes.result || !doBuyRes.result.success) throw new Error((doBuyRes.result && doBuyRes.result.error) || '下单失败')
      const orderId = doBuyRes.result.orderId
      if (payWithBalance) {
        wx.hideLoading()
        wx.showToast({ title: '下单成功', icon: 'success' })
      } else {
        wx.hideLoading()
        wx.showLoading({ title: '拉起支付中...' })
        const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
        const payRes = await wx.cloud.callFunction({ name: 'pay', data: { body: `点餐订单支付¥${finalPrice.toFixed(2)}`, outTradeNo: orderId, totalFee: finalPrice, nonceStr } })
        const payment = payRes.result && payRes.result.payment ? payRes.result.payment : payRes.result
        wx.hideLoading()
        await wx.requestPayment(payment)
        wx.showToast({ title: '支付成功，已下单', icon: 'success' })
      }
      this.setData({ cart: {}, cartCount: 0, cartTotalPrice: 0, cartTotalPriceText: '0.00', showCart: false })
      this.loadUserInfo()
      setTimeout(() => wx.switchTab({ url: '/pages/myorder/myorder' }), 1500)
    } catch (err) {
      console.error('创建订单失败', err)
      wx.hideLoading()
      wx.showToast({ title: err.message || '下单失败', icon: 'none' })
    }
  },

  onReachBottom() {
    if (this.data.goodsHasMore && !this.data.goodsLoading && this.data.currentMenuId) {
      this.loadGoods(this.data.currentMenuId, true)
    }
  },

  onGoodsScrollToLower() {
    if (this.data.goodsHasMore && !this.data.goodsLoading && this.data.currentMenuId) {
      this.loadGoods(this.data.currentMenuId, true)
    }
  },

  onShareAppMessage() {
    const list = (this.data.goodsList || []).filter(g => g && g.status !== 0 && (g.image || g.name))
    const pick = list[Math.floor(Math.random() * Math.max(1, list.length))] || null
    const shopName = (this.data.shopInfo && this.data.shopInfo.name) || (getApp().globalData.shopName || '美食在线')
    if (pick) {
      return require('../../utils/share.js').shareMessage({
        type: 'goods',
        title: (pick.name || '招牌推荐') + ' · ' + shopName,
        path: '/pages/index/index',
        goods: {
          id: pick._id || pick.id,
          name: pick.name,
          price: pick.memberPrice || pick.price,
          originPrice: pick.memberPrice && pick.memberPrice !== pick.price ? pick.price : '',
          discountText: pick.customDiscount > 0 && pick.customDiscount < 100 ? (pick.customDiscount / 10) + '折' : '',
          image: pick.image,
          tags: ['热销', '现做']
        }
      })
    }
    return require('../../utils/share.js').shareMessage({
      type: 'brand',
      title: shopName + ' · 新鲜现做',
      path: '/pages/index/index'
    })
  },
  onShareTimeline() {
    const shopName = (this.data.shopInfo && this.data.shopInfo.name) || (getApp().globalData.shopName || '美食在线')
    return require('../../utils/share.js').shareTimelineMessage({
      title: shopName + ' · 新鲜现做'
    })
  },

  // 搜索输入
  onSearchInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    if (keyword) {
      this.performSearch(keyword)
    } else {
      this.setData({ searchResults: [], searched: false })
    }
  },

  // 搜索确认
  onSearchConfirm(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    if (keyword) {
      this.performSearch(keyword)
    }
  },

  // 清除搜索
  clearSearch() {
    this.setData({ searchKeyword: '', searchResults: [], searched: false })
  },

  // 执行搜索
  async performSearch(keyword) {
    if (!keyword) return
    wx.showLoading({ title: '搜索中...' })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      // 使用正则搜索菜品名称（模糊匹配）
      const res = await db.collection('dish')
        .where(_.and([
          { status: 1 },
          _.or([
            { name: db.RegExp({ regexp: keyword, options: 'i' }) },
            { description: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        ]))
        .orderBy('sort', 'asc')
        .limit(50)
        .get()
      const list = (res.data || []).map(goods => {
        goods.cartCount = this.getDishCartCount(goods._id)
        goods.memberPrice = this.calcMemberPrice(goods.price)
        return goods
      })
      this.setData({ searchResults: list, searched: true })
    } catch (err) {
      console.error('搜索失败', err)
      wx.showToast({ title: '搜索失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async onPullDownRefresh() {
    try {
      this.setData({ goodsPage: 0, goodsHasMore: true, goodsLoading: false })
      await Promise.all([this.loadShopInfo(), this.loadMenu(false), this.loadUserInfo(), this.loadNotices()])
    } catch (err) {
      console.error('刷新失败', err)
    } finally {
      wx.stopPullDownRefresh()
    }
  }
})