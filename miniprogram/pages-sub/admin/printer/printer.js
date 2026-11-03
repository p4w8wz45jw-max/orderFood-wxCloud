// pages-sub/admin/printer/printer.js
const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    printerInfo: null,
    printerStatus: {
      onlineStatus: 0,
      workStatus: -1,
      workStatusDesc: '未知'
    },
    showBindModal: false,
    bindForm: { sn: '', key: '', name: '' },
    densityText: { 4: '较淡', 5: '普通', 6: '较浓', 7: '浓' },
    speedText: { 1: '慢', 2: '中', 3: '快' },
    printTemplate: 'default',
    shopInfoId: ''
  },

  onLoad() {
    this.setThemeColor()
    this.loadPrinterInfo()
    this.loadPrintTemplate()
  },

  onShow() {
    this.setThemeColor()
    if (this.data.printerInfo) {
      this.queryStatus()
    }
    this.loadPrintTemplate()
  },

  // 加载打印模板设置
  async loadPrintTemplate() {
    try {
      const res = await db.collection('shopinfo').limit(1).get()
      if (res.data && res.data.length > 0) {
        this.setData({
          printTemplate: res.data[0].printTemplate || 'default',
          shopInfoId: res.data[0]._id
        })
      }
    } catch (err) {
      console.error('加载打印模板设置失败', err)
    }
  },

  // 设置打印模板
  async setPrintTemplate(e) {
    const template = e.currentTarget.dataset.value
    const shopInfoId = this.data.shopInfoId
    wx.showLoading({ title: '保存中...' })
    try {
      if (shopInfoId) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: {
            action: 'update',
            collection: 'shopinfo',
            docId: shopInfoId,
            data: { printTemplate: template }
          }
        })
      } else {
        // 如果没有shopinfo记录，创建一个
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: {
            action: 'add',
            collection: 'shopinfo',
            data: { printTemplate: template }
          }
        })
      }
      this.setData({ printTemplate: template })
      wx.showToast({ title: '模板设置成功', icon: 'success' })
    } catch (err) {
      console.error('保存模板设置失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  // 从数据库加载打印机信息
  async loadPrinterInfo() {
    try {
      const res = await db.collection('printer').limit(1).get()
      if (res.data && res.data.length > 0) {
        this.setData({ printerInfo: res.data[0] })
        this.queryStatus()
      } else {
        this.setData({ printerInfo: null })
      }
    } catch (err) {
      console.error('加载打印机信息失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 显示绑定弹窗
  showBindModal() {
    this.setData({
      showBindModal: true,
      bindForm: { sn: '', key: '', name: '' }
    })
  },

  closeBindModal() {
    this.setData({ showBindModal: false })
  },

  stopPropagation() {},

  onSnInput(e) {
    this.setData({ 'bindForm.sn': e.detail.value })
  },

  onKeyInput(e) {
    this.setData({ 'bindForm.key': e.detail.value })
  },

  onNameInput(e) {
    this.setData({ 'bindForm.name': e.detail.value })
  },

  // 确认绑定
  async confirmBind() {
    const { sn, key, name } = this.data.bindForm
    if (!sn || !sn.trim()) {
      wx.showToast({ title: '请输入设备编号', icon: 'none' })
      return
    }
    if (!key || !key.trim()) {
      wx.showToast({ title: '请输入绑定码', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '绑定中...' })
      const bindRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'addPrinter',
          sn: sn.trim(),
          key: key.trim(),
          name: name.trim() || `打印机${sn}`
        }
      })
      if (!bindRes.result || !bindRes.result.success) {
        if (bindRes.result?.error?.includes('已绑定') || bindRes.result?.error?.includes('already')) {
          wx.showToast({ title: '设备已绑定过，将直接保存', icon: 'none' })
        } else {
          wx.hideLoading()
          wx.showToast({ title: bindRes.result?.error || '绑定失败', icon: 'none' })
          return
        }
      } else {
        wx.showToast({ title: '绑定成功', icon: 'success' })
      }

      // 保存到本地数据库
      const exist = await db.collection('printer').where({ sn: sn.trim() }).get()
      if (exist.data.length === 0) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'printer', data: {
            sn: sn.trim(),
            key: key.trim(),
            name: name.trim() || `打印机${sn}`,
            density: 6,
            printSpeed: 2,
            volume: 3,
            createTime: db.serverDate()
          } }
        })
      }
      wx.hideLoading()
      this.closeBindModal()
      this.loadPrinterInfo()
    } catch (err) {
      wx.hideLoading()
      console.error('绑定失败', err)
      wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
    }
  },

  // 解绑打印机
  unbindPrinter() {
    wx.showModal({
      title: '确认解绑',
      content: '确定要解绑打印机吗？',
      success: async (res) => {
        if (res.confirm) {
          await this.doUnbindPrinter()
        }
      }
    })
  },

  async doUnbindPrinter() {
    try {
      wx.showLoading({ title: '解绑中...' })
      const printerInfo = this.data.printerInfo
      if (!printerInfo) return
      const unbindRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: { $url: 'delPrinter', sn: [printerInfo.sn] }
      })
      if (!unbindRes.result || !unbindRes.result.success) {
        console.warn('云端解绑失败', unbindRes.result?.error)
      }
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'remove', collection: 'printer', docId: printerInfo._id }
      })
      wx.hideLoading()
      wx.showToast({ title: '解绑成功', icon: 'success' })
      this.setData({
        printerInfo: null,
        printerStatus: { onlineStatus: 0, workStatus: -1, workStatusDesc: '未知' }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('解绑失败', err)
      wx.showToast({ title: err.message || '解绑失败', icon: 'none' })
    }
  },

  // 查询打印机状态（修正解析逻辑）
  async queryStatus() {
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: { $url: 'getDeviceStatus', sn: printerInfo.sn }
      })
      console.log('查询状态原始返回:', res.result)

      if (res.result && res.result.success && res.result.data) {
        const xpData = res.result.data
        if (xpData.code === 0 && xpData.data !== undefined) {
          const onlineStatus = (xpData.data === 1) ? 1 : 0
          const workStatusDesc = onlineStatus === 1 ? '在线' : '离线'
          this.setData({
            printerStatus: {
              onlineStatus: onlineStatus,
              workStatus: -1,
              workStatusDesc: workStatusDesc
            }
          })
          wx.showToast({
            title: onlineStatus === 1 ? '打印机在线' : '打印机离线',
            icon: 'none'
          })
        } else {
          console.warn('芯烨云返回错误:', xpData.code, xpData.msg)
          this.setData({
            printerStatus: { onlineStatus: 0, workStatus: -1, workStatusDesc: '查询失败' }
          })
        }
      } else {
        console.warn('无法解析状态数据', res.result)
        this.setData({
          printerStatus: { onlineStatus: 0, workStatus: -1, workStatusDesc: '未知' }
        })
      }
    } catch (err) {
      console.error('查询状态失败', err)
      wx.showToast({ title: '查询失败', icon: 'none' })
    }
  },

  // 测试打印（使用正确的芯烨云打印内容格式）
  async testPrint() {
    const printerInfo = this.data.printerInfo
    if (!printerInfo) {
      wx.showToast({ title: '未绑定打印机', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '打印中...' })
      const shopRes = await db.collection('shopinfo').limit(1).get()
      const shopName = shopRes.data[0]?.name || '餐饮点餐'
      const date = new Date()
      const testOrderId = 'TEST_' + Date.now()

      // 芯烨云 HTML 标签打印内容格式
      const content =
        '<C><font# bolder=1 height=2 width=2>' + shopName + '</font#></C><BR>' +
        '<C>测试订单</C><BR>' +
        '<LEFT>订单号：' + testOrderId + '</LEFT><BR>' +
        '<LEFT>时间：' + date.toLocaleString() + '</LEFT><BR>' +
        '<C>--------------------------------</C><BR>' +
        '<C>菜品名称        数量    单价</C><BR>' +
        '<LEFT>测试菜品1          1        ￥10.00</LEFT><BR>' +
        '<LEFT>测试菜品2          2        ￥20.00</LEFT><BR>' +
        '<C>--------------------------------</C><BR>' +
        '<RIGHT>合计：￥30.00</RIGHT><BR>' +
        '<C>感谢惠顾！</C><BR>' +
        '<C>欢迎下次光临</C><BR>'

      const printRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'printNote',
          sn: printerInfo.sn,
          voice: '16',
          voicePlayTimes: 1,
          voicePlayInterval: 3,
          content: content,
          copies: 1,
          expiresInSeconds: 7200,
          outTradeNo: 'TEST_' + Date.now()
        }
      })
      wx.hideLoading()
      if (printRes.result && printRes.result.success) {
        wx.showToast({ title: '测试打印成功', icon: 'success' })
      } else {
        wx.showToast({ title: printRes.result?.error || '测试打印失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('测试打印失败', err)
      wx.showToast({ title: err.message || '测试打印失败', icon: 'none' })
    }
  },

  // 设置打印浓度
  async setDensity(e) {
    const density = parseInt(e.currentTarget.dataset.value)
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return
    try {
      wx.showLoading({ title: '设置中...' })
      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: { $url: 'setDensity', sn: printerInfo.sn, density }
      })
      if (res.result && res.result.success) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'printer', docId: printerInfo._id, data: { density } }
        })
        this.setData({ 'printerInfo.density': density })
        wx.showToast({ title: '设置成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.result?.error || '设置失败', icon: 'none' })
      }
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '设置失败', icon: 'none' })
    } finally { wx.hideLoading() }
  },

  // 设置打印速度
  async setPrintSpeed(e) {
    const printSpeed = parseInt(e.currentTarget.dataset.value)
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return
    try {
      wx.showLoading({ title: '设置中...' })
      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: { $url: 'setPrintSpeed', sn: printerInfo.sn, printSpeed }
      })
      if (res.result && res.result.success) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'printer', docId: printerInfo._id, data: { printSpeed } }
        })
        this.setData({ 'printerInfo.printSpeed': printSpeed })
        wx.showToast({ title: '设置成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.result?.error || '设置失败', icon: 'none' })
      }
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '设置失败', icon: 'none' })
    } finally { wx.hideLoading() }
  },

  // 设置音量
  async setVolume(e) {
    const volume = parseInt(e.currentTarget.dataset.value)
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return
    try {
      wx.showLoading({ title: '设置中...' })
      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: { $url: 'setVolume', sn: printerInfo.sn, volume }
      })
      if (res.result && res.result.success) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'printer', docId: printerInfo._id, data: { volume } }
        })
        this.setData({ 'printerInfo.volume': volume })
        wx.showToast({ title: '设置成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.result?.error || '设置失败', icon: 'none' })
      }
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '设置失败', icon: 'none' })
    } finally { wx.hideLoading() }
  },

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})