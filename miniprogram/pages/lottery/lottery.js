// pages/lottery/lottery.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    lotteryChance: 0,
    isDrawing: false,
    prizes: [],
    canvasWidth: 600,
    canvasHeight: 600,
    rotateDeg: 0,
    bgImage: '',
    themeColor: '#B8956E',
    records: [],
    showRecords: false,
    recordLoading: false
  },

  async onLoad() {
    console.log('抽奖页面加载')
    this.setThemeColor()
    if (!app.globalData.openid) {
      await app.waitForOpenid()
    }
    this.loadBgImage()
    this.loadConfigAndPrizes()
  },

  onShow() {
    this.setThemeColor()
    if (this.data.prizes.length > 0) {
      this.getLotteryChance()
    }
    // 页面每次显示时刷新抽奖记录（含中奖活动券）
    this.loadRecords()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#B8956E'
    this.setData({ themeColor })
    wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: themeColor })
  },

  async loadBgImage() {
    try {
      const res = await db.collection('config').doc('config').get()
      const fileID = res.data.lotteryBg
      if (fileID) {
        const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (urlRes.fileList && urlRes.fileList.length > 0) {
          this.setData({ bgImage: urlRes.fileList[0].tempFileURL })
        }
      }
    } catch (err) {
      console.error('加载背景失败', err)
    }
  },

  async loadConfigAndPrizes() {
    wx.showLoading({ title: '加载中' })
    try {
      const configRes = await db.collection('lottery_config').doc('config').get()
      const config = configRes.data
      if (!config || !config.enable) {
        wx.showToast({ title: '抽奖活动未开启', icon: 'none' })
        return
      }
      const prizes = config.rules || []
      // 转换图片 fileID 为临时链接
      const fileIDs = prizes.filter(p => p.imageUrl).map(p => p.imageUrl)
      if (fileIDs.length > 0) {
        try {
          const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs })
          if (urlRes.fileList) {
            urlRes.fileList.forEach((item, i) => {
              prizes.find(p => p.imageUrl === item.fileID && (p.imageTempUrl = item.tempFileURL))
            })
          }
        } catch (e) {
          console.error('获取奖品图片链接失败', e)
        }
      }
      this.setData({ prizes })
      console.log('奖品列表:', this.data.prizes.map(p => p.name))
      await this.getLotteryChance()
      this.initCanvas()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async getLotteryChance() {
    try {
      const openid = app.globalData.openid
      if (!openid) return
      const userRes = await db.collection('user').where({ _openid: openid }).get()
      let chance = 0
      if (userRes.data.length > 0) {
        chance = userRes.data[0].lotteryChance || 0
      }
      this.setData({ lotteryChance: chance })
      console.log('剩余抽奖机会:', chance)
    } catch (err) {
      console.error(err)
    }
  },

  // 加载我的抽奖记录（含中奖活动券及使用状态）
  async loadRecords() {
    if (!app.globalData.openid) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'lottery',
        data: { action: 'records' }
      })
      if (res.result && res.result.code === 0) {
        let records = res.result.data || []
        const prizes = this.data.prizes || []
        // 旧记录没有 type 字段，根据奖品名称反向匹配奖品类型
        records = records.map(r => {
          if (!r.type) {
            const match = prizes.find(p => p.name === r.prize)
            if (match) r.type = match.type || ''
          }
          return r
        })
        this.setData({ records })
      }
    } catch (err) {
      console.error('加载抽奖记录失败', err)
    }
  },

  // 打开抽奖记录弹窗
  async openRecords() {
    this.setData({ showRecords: true, recordLoading: true })
    try {
      await this.loadRecords()
    } finally {
      this.setData({ recordLoading: false })
    }
  },

  // 关闭抽奖记录弹窗
  closeRecords() {
    this.setData({ showRecords: false }, () => {
      // 转盘 canvas 被 wx:if 销毁，关闭弹窗后需重新初始化并恢复角度
      this.initCanvas()
    })
  },

  initCanvas() {
    const query = wx.createSelectorQuery()
    query.select('#wheelCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0]) {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio
          canvas.width = this.data.canvasWidth * dpr
          canvas.height = this.data.canvasHeight * dpr
          ctx.scale(dpr, dpr)
          this.canvas = canvas
          this.ctx = ctx
          this.drawWheel()
        }
      })
  },

  drawWheel() {
    if (!this.ctx || !this.data.prizes.length) return
    const { prizes, canvasWidth, canvasHeight, rotateDeg, themeColor } = this.data
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    const radius = canvasWidth * 0.45
    const angleStep = (Math.PI * 2) / prizes.length

    const baseColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7CAC9',
      '#C7CEE6', '#FFB7B2', '#B5EAD7', '#C7E9B0', '#FFDAC1', '#E2F0CB', '#B5F2E8', '#FF9AA2'
    ]
    
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    
    for (let i = 0; i < prizes.length; i++) {
      const startAngle = i * angleStep + rotateDeg * Math.PI / 180
      const endAngle = (i + 1) * angleStep + rotateDeg * Math.PI / 180
      this.ctx.beginPath()
      this.ctx.moveTo(centerX, centerY)
      this.ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      this.ctx.closePath()
      this.ctx.fillStyle = baseColors[i % baseColors.length]
      this.ctx.fill()
      this.ctx.strokeStyle = '#ffffff'
      this.ctx.lineWidth = 3
      this.ctx.stroke()
      
      this.ctx.save()
      this.ctx.translate(centerX, centerY)
      this.ctx.rotate(startAngle + angleStep / 2)
      this.ctx.fillStyle = '#ffffff'
      this.ctx.font = `bold ${radius * 0.14}px "Microsoft YaHei", Arial`
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'middle'
      let text = prizes[i].name || ''
      if (text.length > 6) {
        this.ctx.font = `bold ${radius * 0.11}px "Microsoft YaHei", Arial`
      }
      if (text.length > 8) {
        text = text.slice(0, 7) + '..'
      }
      this.ctx.shadowColor = 'rgba(0,0,0,0.3)'
      this.ctx.shadowBlur = 4
      this.ctx.fillText(text, radius * 0.7, 0)
      this.ctx.shadowColor = 'transparent'
      this.ctx.restore()
    }
    
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, radius * 0.18, 0, 2 * Math.PI)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fill()
    this.ctx.shadowColor = 'rgba(0,0,0,0.2)'
    this.ctx.shadowBlur = 8
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, radius * 0.13, 0, 2 * Math.PI)
    this.ctx.fillStyle = themeColor
    this.ctx.fill()
    this.ctx.shadowColor = 'transparent'
    
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, radius * 0.06, 0, 2 * Math.PI)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fill()
  },

  async startLottery() {
    if (this.data.isDrawing) {
      wx.showToast({ title: '抽奖进行中', icon: 'none' })
      return
    }
    
    if (this.data.lotteryChance <= 0) {
      wx.showToast({ title: '抽奖机会不足，请下单获取', icon: 'none' })
      return
    }
    
    if (!this.data.prizes.length) {
      wx.showToast({ title: '奖品配置错误', icon: 'none' })
      return
    }

    this.setData({ isDrawing: true })
    wx.showLoading({ title: '抽奖中...', mask: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'lottery',
        data: { action: 'draw' }
      })
      wx.hideLoading()
      
      if (res.result && res.result.code === 0) {
        const prize = res.result.data
        console.log('云函数返回奖品:', prize)
        console.log('前端奖品列表:', this.data.prizes.map(p => p.name))
        
        const awardIndex = this.data.prizes.findIndex(p => p.name === prize.name)
        console.log('匹配到的索引:', awardIndex)
        
        if (awardIndex !== -1) {
          await this.runWheelAnimation(awardIndex)
          wx.showModal({
            title: '恭喜中奖',
            content: `获得 ${prize.name}`,
            showCancel: false,
            success: () => {
              this.setData({ isDrawing: false })
              this.getLotteryChance()
            }
          })
        } else {
          console.error('奖品名称不匹配！请检查前端和云函数的奖品名称是否完全一致')
          wx.showToast({ title: '奖品配置错误，请联系管理员', icon: 'none' })
          this.setData({ isDrawing: false })
        }
      } else {
        const msg = res.result?.message || '抽奖失败'
        wx.showToast({ title: msg, icon: 'none' })
        this.setData({ isDrawing: false })
      }
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      wx.showToast({ title: '抽奖失败，请重试', icon: 'none' })
      this.setData({ isDrawing: false })
    }
  },

  runWheelAnimation(targetIndex) {
    return new Promise((resolve) => {
      const { prizes, rotateDeg } = this.data
      const angleStep = 360 / prizes.length
      // 目标扇区的中间角度
      let targetSectorMid = (targetIndex * angleStep) + (angleStep / 2)
      // 指针方向：固定向上（-90°）
      const pointerAngle = -90
      // 计算需要旋转到的角度，使目标扇区中间对齐指针
      let targetRotate = (pointerAngle - targetSectorMid + 360) % 360
      let currentAngle = rotateDeg % 360
      let delta = (360 * 5) + ((targetRotate - currentAngle + 360) % 360)
      let endAngle = currentAngle + delta
      const duration = 3000
      const startTime = Date.now()
      const startAngle = currentAngle
      
      console.log(`目标索引: ${targetIndex}, 当前角度: ${currentAngle}, 目标角度: ${targetRotate}, 旋转增量: ${delta}`)
      
      const timer = setInterval(() => {
        const now = Date.now()
        let t = Math.min(1, (now - startTime) / duration)
        const easeOut = 1 - Math.pow(1 - t, 3)
        const newAngle = startAngle + delta * easeOut
        this.setData({ rotateDeg: newAngle }, () => {
          this.drawWheel()
          if (t >= 1) {
            clearInterval(timer)
            this.setData({ rotateDeg: endAngle % 360 })
            this.drawWheel()
            resolve()
          }
        })
      }, 16)
    })
  },

  stopPropagation() {},

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ type: 'brand', title: '幸运抽奖 · ' + (getApp().globalData.shopName || '美食在线'), path: '/pages/lottery/lottery' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ type: 'brand', title: '幸运抽奖 · ' + (getApp().globalData.shopName || '美食在线') })
  }
})