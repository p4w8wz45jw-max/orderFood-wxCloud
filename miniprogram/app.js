// app.js
const { getShareCardPath } = require('./utils/shareCard.js')

App({
  globalData: {
    openid: '',           // 用户唯一标识
    userInfo: null,       // 用户信息（含手机号等）
    orderMode: 'dineIn',  // 默认点餐模式：堂食
    openidReady: false,   // 标记 openid 是否已获取
    themeColor: '#B8956E', // 暖棕主题色
    inviterOpenid: '',     // 邀请人openid
    shareCardPath: '',     // 分享卡图片本地路径（异步缓存）
    shopName: ''           // 店铺名称（用于分享卡标题）
  },

  onLaunch() {
    // 初始化云开发环境
    wx.cloud.init({
      env: 'your-env-id',  // ⚠️ 改成你自己的云开发环境ID（开发者工具-云开发控制台可查看）
      traceUser: true
    })

    // 异步预生成分享卡（首启时绘制一次，后续复用本地文件）
    setTimeout(() => { this.prepareShareCard() }, 1500)

    // 版本更新检测（强制更新）
    if (wx.getUpdateManager) {
      const updateManager = wx.getUpdateManager()
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          updateManager.onUpdateReady(() => {
            wx.showModal({
              title: '版本更新',
              content: '新版本已就绪，点击确定重启应用',
              showCancel: false,
              confirmText: '立即更新',
              success: () => {
                updateManager.applyUpdate()
              }
            })
          })
          updateManager.onUpdateFailed(() => {
            wx.showModal({
              title: '更新失败',
              content: '新版本下载失败，请删除小程序后重新搜索进入',
              showCancel: false
            })
          })
        }
      })
    }

    // 从本地缓存恢复用户信息
    try {
      const cached = wx.getStorageSync('userInfo')
      if (cached && cached.phoneNumber) {
        this.globalData.userInfo = cached
      }
    } catch (_) {}

    // 静默获取 openid（无需用户授权）
    this.getOpenid()
  },

  // 获取 openid 并存储到 globalData（返回 Promise）
  getOpenid() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: {}
      }).then(res => {
        this.globalData.openid = res.result.openid
        this.globalData.openidReady = true
        console.log('openid 获取成功:', this.globalData.openid)
        resolve(this.globalData.openid)
      }).catch(err => {
        console.error('获取 openid 失败，请检查 login 云函数是否已部署', err)
        this.globalData.openidReady = false
        reject(err)
      })
    })
  },

  // 等待 openid 获取完成（供页面调用）
  waitForOpenid() {
    return new Promise((resolve) => {
      if (this.globalData.openid) {
        resolve(this.globalData.openid)
        return
      }
      const checkInterval = setInterval(() => {
        if (this.globalData.openid) {
          clearInterval(checkInterval)
          resolve(this.globalData.openid)
        }
      }, 100)
      // 5秒超时
      setTimeout(() => {
        clearInterval(checkInterval)
        console.warn('openid 获取超时')
        resolve(null)
      }, 5000)
    })
  },

  // 异步预生成"分享卡"图片：取店铺名 + Canvas 画品牌海报，缓存到本地。
  prepareShareCard() {
    const fetchAndDraw = (shopName) => {
      this.globalData.shopName = shopName || '美食在线'
      getShareCardPath({ type: 'brand', shopName: this.globalData.shopName, slogan: '新鲜现做' }).then((path) => {
        if (path) this.globalData.shareCardPath = path
      })
    }
    try {
      wx.cloud.callFunction({
        name: 'getShopInfo',
        data: {}
      }).then((res) => {
        const info = (res && res.result && (res.result.data || res.result)) || {}
        fetchAndDraw(info.name || info.shopName || '美食在线')
      }).catch(() => fetchAndDraw('美食在线'))
    } catch (_) {
      fetchAndDraw('美食在线')
    }
  },

  // 分享时同步获取卡面路径（已缓存就直接返回，否则现场画一张）
  getShareCardPath() {
    if (this.globalData.shareCardPath) return Promise.resolve(this.globalData.shareCardPath)
    return getShareCardPath({ type: 'brand', shopName: this.globalData.shopName || '美食在线', slogan: '新鲜现做' }).then((p) => {
      if (p) this.globalData.shareCardPath = p
      return p
    })
  }
})