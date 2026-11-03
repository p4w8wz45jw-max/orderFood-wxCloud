// pages-sub/admin/diyConfig/diyConfig.js
const app = getApp()

Page({
  data: {
    themeColor: '#B8956E',
    enable: false,
    // DIY订单配送费规则（按距离阶梯计费）
    diyBaseFee: '',     // 基础配送费（元）
    diyBaseKm: '',      // 基础公里数（超过该公里开始加收）
    diyPerKm: '',       // 超出后每公里加收（元/公里）
    diyMaxKm: '',       // 最大配送公里数（超出不配送）
    // 两荤一素
    twoEnable: false,
    twoPrice: '',
    twoMeats: [{ name: '', price: '', key: 'tm0' }],
    twoVegs: [{ name: '', key: 'tv0' }],
    // 一荤一素
    oneEnable: false,
    onePrice: '',
    oneMeats: [{ name: '', price: '', key: 'om0' }],
    oneVegs: [{ name: '', key: 'ov0' }],
    // 用户建议
    suggestions: [],
    suggestionsLoading: false
  },

  onLoad() {
    this.setThemeColor()
  },

  onShow() {
    this.setThemeColor()
    this.loadConfig()
    this.loadSuggestions()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  // 读取配置（config 集合 docId: diy_menu）
  async loadConfig() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'get', collection: 'config', docId: 'diy_menu' }
      })
      if (res.result && res.result.success && res.result.data) {
        const data = res.result.data
        const two = data.twoMeatOneVeg || {}
        const one = data.oneMeatOneVeg || {}
        // 兼容旧版通用配置（旧结构 meatOptions/vegOptions）迁移到两荤一素
        const oldMeats = Array.isArray(data.meatOptions) && data.meatOptions.length ? data.meatOptions : null
        const oldVegs = Array.isArray(data.vegOptions) && data.vegOptions.length ? data.vegOptions : null
        const twoHasData = (two.meatOptions && two.meatOptions.length) || (two.vegOptions && two.vegOptions.length)
        const oneHasData = (one.meatOptions && one.meatOptions.length) || (one.vegOptions && one.vegOptions.length)
        this.setData({
          enable: data.enable || false,
          diyBaseFee: this.ruleField(data.diyDeliveryRules, 'baseFee', data.diyDeliveryFee),
          diyBaseKm: this.ruleField(data.diyDeliveryRules, 'baseKm', ''),
          diyPerKm: this.ruleField(data.diyDeliveryRules, 'perKmFee', ''),
          diyMaxKm: this.ruleField(data.diyDeliveryRules, 'maxKm', ''),
          twoEnable: twoHasData ? !!two.enable : (oldMeats ? !!data.enable : false),
          twoPrice: twoHasData ? this.toPriceStr(two.price) : '',
          twoMeats: this.normalizeOptions(twoHasData ? two.meatOptions : (oldMeats || []), 'tm'),
          twoVegs: this.normalizeOptions(twoHasData ? two.vegOptions : (oldVegs || []), 'tv'),
          oneEnable: oneHasData ? !!one.enable : false,
          onePrice: oneHasData ? this.toPriceStr(one.price) : '',
          oneMeats: this.normalizeOptions(one.meatOptions, 'om'),
          oneVegs: this.normalizeOptions(one.vegOptions, 'ov')
        })
      } else {
        this.resetEmpty()
      }
    } catch (err) {
      console.log('DIY配置不存在，使用默认空配置', err)
      this.resetEmpty()
    }
  },

  toPriceStr(v) {
    if (v === undefined || v === null || v === '') return ''
    return String(v)
  },

  // 读取配送规则字段（兼容旧版固定配送费 diyDeliveryFee）
  ruleField(rules, key, fallback) {
    if (rules && rules[key] !== undefined && rules[key] !== null && rules[key] !== '') return String(rules[key])
    if (fallback !== undefined && fallback !== null && fallback !== '') return String(fallback)
    return ''
  },

  resetEmpty() {
    this.setData({
      enable: false,
      diyBaseFee: '',
      diyBaseKm: '',
      diyPerKm: '',
      diyMaxKm: '',
      twoEnable: false,
      twoPrice: '',
      twoMeats: [{ name: '', price: '', key: 'tm0' }],
      twoVegs: [{ name: '', key: 'tv0' }],
      oneEnable: false,
      onePrice: '',
      oneMeats: [{ name: '', price: '', key: 'om0' }],
      oneVegs: [{ name: '', key: 'ov0' }]
    })
  },

  // 标准化选项数组（名称 + 可选加价）
  normalizeOptions(list, prefix) {
    if (!Array.isArray(list) || list.length === 0) {
      return [{ name: '', price: '', key: prefix + '0' }]
    }
    return list.map((item, i) => ({
      name: item.name || '',
      price: item.price === undefined || item.price === null ? '' : String(item.price),
      key: prefix + '_' + i
    }))
  },

  // 总开关
  onEnableChange(e) {
    this.setData({ enable: e.detail.value })
  },

  // DIY订单配送费规则输入
  onDiyBaseFeeInput(e) {
    this.setData({ diyBaseFee: e.detail.value })
  },
  onDiyBaseKmInput(e) {
    this.setData({ diyBaseKm: e.detail.value })
  },
  onDiyPerKmInput(e) {
    this.setData({ diyPerKm: e.detail.value })
  },
  onDiyMaxKmInput(e) {
    this.setData({ diyMaxKm: e.detail.value })
  },

  // 两荤一素开关
  onTwoEnableChange(e) {
    this.setData({ twoEnable: e.detail.value })
  },

  // 一荤一素开关
  onOneEnableChange(e) {
    this.setData({ oneEnable: e.detail.value })
  },

  // ===== 两荤一素 =====
  onTwoPriceInput(e) {
    this.setData({ twoPrice: e.detail.value })
  },
  addTwoMeat() {
    this.setData({ twoMeats: this.data.twoMeats.concat([{ name: '', price: '', key: 'tm' + Date.now() + Math.floor(Math.random() * 1000) }]) })
  },
  removeTwoMeat(e) {
    const list = this.data.twoMeats.slice()
    list.splice(e.currentTarget.dataset.index, 1)
    this.setData({ twoMeats: list.length ? list : [{ name: '', price: '', key: 'tm' + Date.now() }] })
  },
  onTwoMeatInput(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`twoMeats[${idx}].name`]: e.detail.value })
  },
  onTwoMeatPriceInput(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`twoMeats[${idx}].price`]: e.detail.value })
  },
  addTwoVeg() {
    this.setData({ twoVegs: this.data.twoVegs.concat([{ name: '', key: 'tv' + Date.now() + Math.floor(Math.random() * 1000) }]) })
  },
  removeTwoVeg(e) {
    const list = this.data.twoVegs.slice()
    list.splice(e.currentTarget.dataset.index, 1)
    this.setData({ twoVegs: list.length ? list : [{ name: '', key: 'tv' + Date.now() }] })
  },
  onTwoVegInput(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`twoVegs[${idx}].name`]: e.detail.value })
  },

  // ===== 一荤一素 =====
  onOnePriceInput(e) {
    this.setData({ onePrice: e.detail.value })
  },
  addOneMeat() {
    this.setData({ oneMeats: this.data.oneMeats.concat([{ name: '', price: '', key: 'om' + Date.now() + Math.floor(Math.random() * 1000) }]) })
  },
  removeOneMeat(e) {
    const list = this.data.oneMeats.slice()
    list.splice(e.currentTarget.dataset.index, 1)
    this.setData({ oneMeats: list.length ? list : [{ name: '', price: '', key: 'om' + Date.now() }] })
  },
  onOneMeatInput(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`oneMeats[${idx}].name`]: e.detail.value })
  },
  onOneMeatPriceInput(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`oneMeats[${idx}].price`]: e.detail.value })
  },
  addOneVeg() {
    this.setData({ oneVegs: this.data.oneVegs.concat([{ name: '', key: 'ov' + Date.now() + Math.floor(Math.random() * 1000) }]) })
  },
  removeOneVeg(e) {
    const list = this.data.oneVegs.slice()
    list.splice(e.currentTarget.dataset.index, 1)
    this.setData({ oneVegs: list.length ? list : [{ name: '', key: 'ov' + Date.now() }] })
  },
  onOneVegInput(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`oneVegs[${idx}].name`]: e.detail.value })
  },

  // 保存配置
  async saveConfig() {
    const { enable, diyBaseFee, diyBaseKm, diyPerKm, diyMaxKm, twoEnable, twoPrice, twoMeats, twoVegs, oneEnable, onePrice, oneMeats, oneVegs } = this.data

    // 保留名称与可选加价（加价为0或空则不存）
    const cleanOptions = (list) => (list || [])
      .filter(i => i && (i.name || '').trim())
      .map(i => {
        const opt = { name: String(i.name).trim() }
        const p = Number(i.price)
        if (p && p > 0) opt.price = p
        return opt
      })

    const twoMeatOpts = cleanOptions(twoMeats)
    const twoVegOpts = cleanOptions(twoVegs)
    const oneMeatOpts = cleanOptions(oneMeats)
    const oneVegOpts = cleanOptions(oneVegs)

    if (enable) {
      if (!twoEnable && !oneEnable) {
        wx.showToast({ title: '请至少开启一个套餐', icon: 'none' })
        return
      }
      if (twoEnable) {
        if (twoMeatOpts.length < 2) {
          wx.showToast({ title: '两荤一素开启时至少填写2个肉类', icon: 'none' })
          return
        }
        if (twoVegOpts.length < 1) {
          wx.showToast({ title: '两荤一素开启时至少填写1个菜类', icon: 'none' })
          return
        }
        if (!Number(twoPrice) || Number(twoPrice) <= 0) {
          wx.showToast({ title: '请填写两荤一素套餐价格', icon: 'none' })
          return
        }
      }
      if (oneEnable) {
        if (oneMeatOpts.length < 1) {
          wx.showToast({ title: '一荤一素开启时至少填写1个肉类', icon: 'none' })
          return
        }
        if (oneVegOpts.length < 1) {
          wx.showToast({ title: '一荤一素开启时至少填写1个菜类', icon: 'none' })
          return
        }
        if (!Number(onePrice) || Number(onePrice) <= 0) {
          wx.showToast({ title: '请填写一荤一素套餐价格', icon: 'none' })
          return
        }
      }
    }

    const dataToSave = {
      enable,
      diyDeliveryRules: {
        baseFee: Number(diyBaseFee) > 0 ? Number(diyBaseFee) : 0,
        baseKm: Number(diyBaseKm) > 0 ? Number(diyBaseKm) : 0,
        perKmFee: Number(diyPerKm) > 0 ? Number(diyPerKm) : 0,
        maxKm: Number(diyMaxKm) > 0 ? Number(diyMaxKm) : 0
      },
      twoMeatOneVeg: {
        enable: twoEnable,
        price: Number(twoPrice) || 0,
        meatOptions: twoMeatOpts,
        vegOptions: twoVegOpts
      },
      oneMeatOneVeg: {
        enable: oneEnable,
        price: Number(onePrice) || 0,
        meatOptions: oneMeatOpts,
        vegOptions: oneVegOpts
      },
      updateTime: new Date()
    }

    wx.showLoading({ title: '保存中...' })
    try {
      const getRes = await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'get', collection: 'config', docId: 'diy_menu' }
      })
      if (getRes.result && getRes.result.success) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'config', docId: 'diy_menu', data: dataToSave }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'set', collection: 'config', docId: 'diy_menu', data: dataToSave }
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('保存DIY配置失败', err)
      try {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'set', collection: 'config', docId: 'diy_menu', data: dataToSave }
        })
        wx.hideLoading()
        wx.showToast({ title: '保存成功', icon: 'success' })
      } catch (err2) {
        wx.hideLoading()
        console.error('保存DIY配置失败(重试)', err2)
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }
  },

  // ===== 用户建议 =====
  async loadSuggestions() {
    this.setData({ suggestionsLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllData',
        data: { collection: 'diy_suggestion' }
      })
      if (res.result && res.result.success) {
        const sorted = (res.result.data || []).slice().sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
        this.setData({
          suggestions: sorted.map(s => ({
            _id: s._id,
            content: s.content || '',
            nickName: s.nickName || '',
            phoneNumber: s.phoneNumber || '',
            timeText: this.formatTime(s.createTime)
          })),
          suggestionsLoading: false
        })
      } else {
        this.setData({ suggestions: [], suggestionsLoading: false })
      }
    } catch (err) {
      console.error('加载建议失败', err)
      this.setData({ suggestions: [], suggestionsLoading: false })
    }
  },

  formatTime(t) {
    if (!t) return ''
    const d = new Date(t)
    if (isNaN(d.getTime())) return ''
    const p = (n) => (n < 10 ? '0' + n : '' + n)
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },

  deleteSuggestion(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除建议',
      content: '确定删除这条用户建议吗？',
      confirmColor: '#e54d42',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await wx.cloud.callFunction({
            name: 'adminSaveData',
            data: { action: 'remove', collection: 'diy_suggestion', docId: id }
          })
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadSuggestions()
        } catch (err) {
          console.error('删除建议失败', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})
