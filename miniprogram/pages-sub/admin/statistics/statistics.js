// pages-sub/admin/statistics/statistics.js
const app = getApp()

Page({
  data: {
    themeColor: '#B8956E',
    startDate: '',
    endDate: '',
    today: '',
    loading: false,
    hasData: false,
    summary: {
      totalRevenue: 0,
      totalRefund: 0,
      orderCount: 0,
      refundCount: 0,
      netIncome: 0
    },
    productList: []
  },

  onLoad() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`

    // 默认查询最近7天
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const wy = weekAgo.getFullYear()
    const wm = String(weekAgo.getMonth() + 1).padStart(2, '0')
    const wd = String(weekAgo.getDate()).padStart(2, '0')
    const weekStr = `${wy}-${wm}-${wd}`

    this.setData({
      themeColor: app.globalData.themeColor || '#B8956E',
      startDate: weekStr,
      endDate: todayStr,
      today: todayStr
    })

    // 自动加载数据
    this.loadStatistics()
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value })
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value })
  },

  // 快速选择日期范围
  onQuickRange(e) {
    const range = e.currentTarget.dataset.range
    const now = new Date()
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    let startDate = endDate
    const d = new Date()

    switch (range) {
      case 'today':
        break
      case 'yesterday':
        d.setDate(d.getDate() - 1)
        startDate = endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        break
      case 'week':
        d.setDate(d.getDate() - 6)
        startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        break
      case 'month':
        d.setDate(d.getDate() - 29)
        startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        break
    }

    this.setData({ startDate, endDate }, () => {
      this.loadStatistics()
    })
  },

  async loadStatistics() {
    const { startDate, endDate } = this.data
    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择日期范围', icon: 'none' })
      return
    }

    if (startDate > endDate) {
      wx.showToast({ title: '开始日期不能大于结束日期', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'adminStatistics',
        data: { startDate, endDate }
      })

      if (res.result && res.result.success) {
        const d = res.result.data
        this.setData({
          hasData: true,
          summary: {
            totalRevenue: d.totalRevenue,
            totalRefund: d.totalRefund,
            orderCount: d.orderCount,
            refundCount: d.refundCount,
            netIncome: parseFloat((d.totalRevenue - d.totalRefund).toFixed(2))
          },
          productList: d.productList
        })
      } else {
        wx.showToast({ title: res.result?.error || '查询失败', icon: 'none' })
      }
    } catch (err) {
      console.error('加载统计数据失败', err)
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
