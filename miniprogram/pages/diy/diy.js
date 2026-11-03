// pages/diy/diy.js
const app = getApp()

Page({
  data: {
    themeColor: '#B8956E',
    configLoaded: false,
    enable: false,
    diyDeliveryRules: null,
    // 两荤一素
    twoEnable: false,
    twoPrice: 0,
    twoMeats: [],
    twoVegs: [],
    // 一荤一素
    oneEnable: false,
    onePrice: 0,
    oneMeats: [],
    oneVegs: [],
    // 选择弹层（当前套餐选项）
    showSelector: false,
    selectorType: '',      // twoMeatOneVeg | oneMeatOneVeg
    selectorTitle: '',
    maxMeat: 2,
    currentMeats: [],
    currentVegs: [],
    selectedMeatIndexes: [],
    selectedVegIndex: -1,
    totalPrice: 0,
    extraTip: '',
    // 提建议弹层
    showSuggestion: false,
    suggestionText: '',
    suggesting: false,
    // 一周菜单
    weekDays: [
      { day: 1, label: '周一' },
      { day: 2, label: '周二' },
      { day: 3, label: '周三' },
      { day: 4, label: '周四' },
      { day: 5, label: '周五' },
      { day: 6, label: '周六' },
      { day: 7, label: '周日' }
    ],
    weekMenus: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null },
    weekEditDay: null,   // 正在配置的星期（null=普通下单）
    weekConfirmText: '去结算',
    weekExpanded: false  // 一周菜单默认收起
  },

  // 展开/收起一周菜单
  toggleWeek() {
    this.setData({ weekExpanded: !this.data.weekExpanded })
  },

  onLoad() {
    this.setThemeColor()
    this.loadConfig()
    this.loadWeekMenus()
  },

  // 读取本地保存的一周菜单
  loadWeekMenus() {
    try {
      const saved = wx.getStorageSync('diyWeekMenu')
      if (saved && typeof saved === 'object') {
        const weekMenus = Object.assign({}, this.data.weekMenus)
        Object.keys(saved).forEach(k => {
          if (weekMenus[k] !== undefined) {
            const menu = saved[k]
            if (menu) {
              menu.comboText = (menu.meatNames || []).join('、') + ' + ' + (menu.vegName || '')
              weekMenus[k] = menu
            } else {
              weekMenus[k] = null
            }
          }
        })
        this.setData({ weekMenus })
      }
    } catch (_) {}
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  // 加载后台配置（config 集合 docId: diy_menu）
  async loadConfig() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'config' }
      })
      if (res.result && res.result.success) {
        const cfg = (res.result.data || []).find(d => d._id === 'diy_menu')
        if (cfg && cfg.enable) {
          const two = cfg.twoMeatOneVeg || {}
          const one = cfg.oneMeatOneVeg || {}
          // 兼容旧版通用配置（meatOptions/vegOptions）迁移到两荤一素
          const oldHasData = Array.isArray(cfg.meatOptions) && cfg.meatOptions.length > 0
          const twoMeats = oldHasData && !(two.meatOptions && two.meatOptions.length) ? cfg.meatOptions : (two.meatOptions || [])
          const twoVegs = oldHasData && !(two.vegOptions && two.vegOptions.length) ? cfg.vegOptions : (two.vegOptions || [])
          const twoEnable = (two.meatOptions && two.meatOptions.length) || (two.vegOptions && two.vegOptions.length)
            ? !!two.enable
            : (oldHasData ? !!cfg.enable : false)
          this.setData({
            configLoaded: true,
            enable: true,
            diyDeliveryRules: cfg.diyDeliveryRules || (cfg.diyDeliveryFee !== undefined ? { baseFee: Number(cfg.diyDeliveryFee) || 0, baseKm: 0, perKmFee: 0, maxKm: 0 } : null),
            twoEnable,
            twoPrice: Number(two.price) || 0,
            twoMeats: this.normalizeOptions(twoMeats, 'm'),
            twoVegs: this.normalizeOptions(twoVegs, 'v'),
            oneEnable: !!one.enable,
            onePrice: Number(one.price) || 0,
            oneMeats: this.normalizeOptions(one.meatOptions, 'm'),
            oneVegs: this.normalizeOptions(one.vegOptions, 'v')
          })
          return
        }
      }
      this.setData({ configLoaded: true, enable: false })
    } catch (err) {
      console.error('加载DIY配置失败', err)
      this.setData({ configLoaded: true, enable: false })
    }
  },

  // 标准化选项（名称列表）
  normalizeOptions(list, prefix) {
    if (!Array.isArray(list)) return []
    return list
      .filter(m => m && m.name && String(m.name).trim())
      .map((m, i) => ({ name: String(m.name).trim(), price: Number(m.price) || 0, key: prefix + i }))
  },

  // 点击套餐卡片打开选择弹层（普通下单）
  openSelector(e) {
    const type = e.currentTarget.dataset.type
    this.prepareSelector(type, null)
  },

  // 点击星期卡片配置/编辑一周菜单
  openWeekSelector(e) {
    const day = e.currentTarget.dataset.day
    if (day === undefined || day === null) return
    const saved = this.data.weekMenus[day]
    this.prepareSelector(saved ? saved.type : 'twoMeatOneVeg', day)
  },

  // 准备选择弹层（day 为空=普通下单，否则=保存到星期菜单）
  prepareSelector(type, day) {
    if (!this.data.enable) {
      wx.showToast({ title: 'DIY菜单暂未开启', icon: 'none' })
      return
    }
    const isTwo = type === 'twoMeatOneVeg'
    if (isTwo && !this.data.twoEnable) {
      wx.showToast({ title: '两荤一素暂未开启', icon: 'none' })
      return
    }
    if (!isTwo && !this.data.oneEnable) {
      wx.showToast({ title: '一荤一素暂未开启', icon: 'none' })
      return
    }
    const meats = isTwo ? this.data.twoMeats : this.data.oneMeats
    const vegs = isTwo ? this.data.twoVegs : this.data.oneVegs
    const price = isTwo ? this.data.twoPrice : this.data.onePrice
    const maxMeat = isTwo ? 2 : 1
    if (meats.length < maxMeat || vegs.length < 1) {
      wx.showToast({ title: '该套餐选项不足，请联系商家', icon: 'none' })
      return
    }
    // 编辑已有星期菜单时，预选之前的内容
    let selectedMeatIndexes = []
    let selectedVegIndex = -1
    if (day) {
      const saved = this.data.weekMenus[day]
      if (saved) {
        selectedMeatIndexes = (saved.meatNames || [])
          .map(n => meats.findIndex(m => m.name === n))
          .filter(i => i >= 0)
        selectedVegIndex = vegs.findIndex(v => v.name === saved.vegName)
      }
    }
    this.setData({
      showSelector: true,
      selectorType: type,
      selectorTitle: isTwo ? '两荤一素（选2荤1素）' : '一荤一素（选1荤1素）',
      maxMeat,
      currentMeats: this.markOptions(meats, selectedMeatIndexes),
      currentVegs: this.markOptions(vegs, [selectedVegIndex]),
      selectedMeatIndexes,
      selectedVegIndex,
      totalPrice: this.calcTotalPrice(price, selectedMeatIndexes, meats),
      extraTip: this.calcExtraTip(selectedMeatIndexes, meats),
      weekEditDay: day,
      weekConfirmText: day ? '保存到' + this.getDayLabel(day) : '去结算'
    })
  },

  // 为选项列表附加选中标记（WXML 直接读 item.selected，避免 indexOf 表达式不可靠）
  markOptions(list, indexes) {
    return (list || []).map((item, i) => {
      const copy = Object.assign({}, item)
      copy.selected = (indexes || []).indexOf(i) > -1
      return copy
    })
  },

  // 计算当前搭配总价 = 套餐价 + 已选肉类加价
  calcTotalPrice(basePrice, indexes, meats) {
    let total = Number(basePrice) || 0
    ;(indexes || []).forEach(i => {
      if (meats[i]) total += Number(meats[i].price) || 0
    })
    return Math.round(total * 100) / 100
  },

  // 已选肉类的加价提示文案（无加价返回空串）
  calcExtraTip(indexes, meats) {
    const extra = (indexes || []).reduce((s, i) => {
      if (meats[i]) s += Number(meats[i].price) || 0
      return s
    }, 0)
    return extra > 0 ? ('已含加价 ¥' + (Math.round(extra * 100) / 100)) : ''
  },

  closeSelector() {
    this.setData({ showSelector: false, weekEditDay: null })
  },

  stopPropagation() {},

  toggleMeat(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (isNaN(index)) return
    const selected = this.data.selectedMeatIndexes.slice()
    const pos = selected.indexOf(index)
    if (pos >= 0) {
      selected.splice(pos, 1)
    } else {
      if (selected.length >= this.data.maxMeat) {
        wx.showToast({ title: `最多选择${this.data.maxMeat}个肉类`, icon: 'none' })
        return
      }
      selected.push(index)
    }
    const base = this.data.selectorType === 'twoMeatOneVeg' ? this.data.twoPrice : this.data.onePrice
    this.setData({
      selectedMeatIndexes: selected,
      currentMeats: this.markOptions(this.data.currentMeats, selected),
      totalPrice: this.calcTotalPrice(base, selected, this.data.currentMeats),
      extraTip: this.calcExtraTip(selected, this.data.currentMeats)
    })
  },

  toggleVeg(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (isNaN(index)) return
    const next = index === this.data.selectedVegIndex ? -1 : index
    this.setData({
      selectedVegIndex: next,
      currentVegs: this.markOptions(this.data.currentVegs, [next])
    })
  },

  // 确认搭配：普通下单直接进结算；星期配置模式保存到一周菜单
  confirmOrder() {
    const { selectorType, selectedMeatIndexes, selectedVegIndex, currentMeats, currentVegs, maxMeat, weekEditDay } = this.data
    const isTwo = selectorType === 'twoMeatOneVeg'
    const basePrice = isTwo ? this.data.twoPrice : this.data.onePrice
    const price = this.calcTotalPrice(basePrice, selectedMeatIndexes, currentMeats)
    if (selectedMeatIndexes.length < maxMeat) {
      wx.showToast({ title: `请选择${maxMeat}个肉类`, icon: 'none' })
      return
    }
    if (selectedVegIndex < 0) {
      wx.showToast({ title: '请选择1个菜类', icon: 'none' })
      return
    }
    if (!price || price <= 0) {
      wx.showToast({ title: '价格异常，请稍后再试', icon: 'none' })
      return
    }
    const dishId = isTwo ? 'diy_twoMeatOneVeg' : 'diy_oneMeatOneVeg'
    const dishName = isTwo ? 'DIY两荤一素' : 'DIY一荤一素'
    const meatNames = selectedMeatIndexes.map(i => currentMeats[i].name)
    const vegName = currentVegs[selectedVegIndex].name

    // 配置一周菜单：保存到本地存储
    if (weekEditDay) {
      const menu = {
        type: selectorType,
        dishId,
        dishName,
        meatNames,
        vegName,
        price,
        comboText: meatNames.join('、') + ' + ' + vegName
      }
      const weekMenus = Object.assign({}, this.data.weekMenus, { [weekEditDay]: menu })
      this.setData({ weekMenus, weekEditDay: null, showSelector: false })
      try { wx.setStorageSync('diyWeekMenu', weekMenus) } catch (_) {}
      wx.showToast({ title: `已保存到${this.getDayLabel(weekEditDay)}`, icon: 'success' })
      return
    }

    this.goSettle(dishId, dishName, meatNames, vegName, price)
  },

  getDayLabel(day) {
    const d = this.data.weekDays.find(x => x.day === day)
    return d ? d.label : ('周' + day)
  },

  // 构造购物车并跳转结算
  goSettle(dishId, dishName, meatNames, vegName, price) {
    try {
      wx.setStorageSync('settleCartData', {
        cart: {
          [dishId]: {
            dishId: dishId,
            info: { _id: dishId, name: dishName, price: price, image: '' },
            count: 1,
            tags: {},
            tagLabels: [...meatNames, vegName],
            canUseMiandan: false
          }
        },
        totalPrice: price,
        orderMode: 'dineIn',
        isDiyOrder: true,
        diyDeliveryRules: this.data.diyDeliveryRules || null
      })
      wx.navigateTo({ url: '/pages/settle/settle' })
    } catch (err) {
      console.error('跳转结算失败', err)
      wx.showToast({ title: '跳转失败', icon: 'none' })
    }
  },

  // 点击卡片上的"去结算"按钮直接付款
  payWeekMenu(e) {
    const day = e.currentTarget.dataset.day
    const menu = this.data.weekMenus[day]
    if (!menu) return
    this.goSettle(menu.dishId, menu.dishName, menu.meatNames, menu.vegName, menu.price)
  },

  // ===== 提建议 =====
  openSuggestion() {
    this.setData({ showSuggestion: true, suggestionText: '' })
  },

  closeSuggestion() {
    this.setData({ showSuggestion: false })
  },

  onSuggestionInput(e) {
    this.setData({ suggestionText: e.detail.value })
  },

  async submitSuggestion() {
    const content = (this.data.suggestionText || '').trim()
    if (!content) {
      wx.showToast({ title: '请输入你想吃的菜品', icon: 'none' })
      return
    }
    if (this.data.suggesting) return
    this.setData({ suggesting: true })
    let nickName = ''
    let phoneNumber = ''
    try {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        nickName = userInfo.nickName || ''
        phoneNumber = userInfo.phoneNumber || ''
      }
    } catch (_) {}
    try {
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: {
          action: 'add',
          collection: 'diy_suggestion',
          data: {
            content,
            nickName,
            phoneNumber,
            createTime: Date.now()
          }
        }
      })
      this.setData({ suggesting: false, showSuggestion: false, suggestionText: '' })
      wx.showToast({ title: '建议已提交，感谢反馈', icon: 'success' })
    } catch (err) {
      console.error('提交建议失败', err)
      this.setData({ suggesting: false })
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: 'DIY 自选 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/diy/diy' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: 'DIY 自选 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})
