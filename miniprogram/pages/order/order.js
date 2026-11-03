// pages/admin/order/order.js
const db = wx.cloud.database()

Page({
  data: {
    orders: [],
    loading: false
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadOrders()
  },

  async loadOrders() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })
    try {
      const res = await db.collection('order')
        .orderBy('createTime', 'desc')
        .get()
      const formatTime = (time) => {
        if (!time) return ''
        const date = time instanceof Date ? time : new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : n)
        const y = date.getFullYear()
        const m = pad(date.getMonth() + 1)
        const d = pad(date.getDate())
        const hh = pad(date.getHours())
        const mm = pad(date.getMinutes())
        return `${y}-${m}-${d} ${hh}:${mm}`
      }
      const list = res.data.map(order => {
        // 计算菜品小计（供管理员核对）
        let goodsSubtotal = 0
        const goodsList = (order.goodsList || []).map(item => {
          const subtotal = ((item.price || 0) * (item.count || 1)).toFixed(2)
          return { ...item, subtotal }
        })
        if (goodsList.length) {
          goodsSubtotal = goodsList.reduce((sum, item) => {
            return sum + ((item.price || 0) * (item.count || 1))
          }, 0)
        }
        const deliveryFeeAmount = order.deliveryFee || 0
        // 总优惠 = 总价 + 配送费 - 实付，但不小于0
        const totalDiscount = Math.max(0, goodsSubtotal + deliveryFeeAmount - (order.finalPrice || 0))
        return {
          ...order,
          goodsList,  // 用带 subtotal 的列表覆盖原 goodsList
          createTimeText: order.createTime ? formatTime(order.createTime) : '',
          orderTypeText: order.orderType === 'takeout' ? '外卖' : (order.orderType === 'dineIn' ? '堂食' : '自取'),
          goodsSubtotal: goodsSubtotal.toFixed(2),
          deliveryFeeText: deliveryFeeAmount > 0 ? deliveryFeeAmount.toFixed(2) : '',
          totalDiscountText: totalDiscount > 0 ? totalDiscount.toFixed(2) : '',
          finalPriceText: (order.finalPrice || 0).toFixed(2)
        }
      })
      this.setData({ orders: list })
    } catch (err) {
      console.error('加载订单失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  // 跳转订单详情页（新增）
  goOrderDetail(e) {
    const order = e.currentTarget.dataset.order
    if (!order) return
    wx.navigateTo({
      url: `/pages/orderDetail/orderDetail?id=${order._id}`
    })
  },

  // 重新打印小票（原有功能，使用 catchtap 防止冒泡）
  async reprint(e) {
    const order = e.currentTarget.dataset.order
    if (!order) return
    wx.showLoading({ title: '打印中...' })
    try {
      const printerRes = await db.collection('printer').limit(1).get()
      if (!printerRes.data.length) {
        wx.showToast({ title: '未绑定打印机', icon: 'none' })
        return
      }
      const sn = printerRes.data[0].sn
      const shopRes = await db.collection('shopinfo').limit(1).get()
      const shopName = shopRes.data[0]?.name || '餐饮店'
      const printTemplate = shopRes.data[0]?.printTemplate || 'default'
      const content = this.generatePrintContent(order, shopName, printTemplate)
      const printRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'printNote',
          sn: sn,
          content: content,
          copies: 1
        }
      })
      if (printRes.result && printRes.result.success) {
        wx.showToast({ title: '打印成功', icon: 'success' })
      } else {
        wx.showToast({ title: printRes.result?.error || '打印失败', icon: 'none' })
      }
    } catch (err) {
      console.error('打印失败', err)
      wx.showToast({ title: '打印失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  generatePrintContent(order, shopName, printTemplate = 'default') {
    if (printTemplate === 'simple') {
      // 精简模板：大字店名、商品名、取餐/配送时间、价格（HTML 格式）
      let content = '<C></C><BR>'
        + '<C></C><BR>'
        + '<C><font# bolder=1 height=4 width=4>' + shopName + '</font#></C><BR>'
        + '<BR>'
      if (order.goodsList && order.goodsList.length) {
        order.goodsList.forEach(item => {
          const name = (item.dishName && item.dishName.length > 12) ? item.dishName.slice(0, 10) + '..' : (item.dishName || '')
          const price = (item.price || 0).toFixed(2)
          content += '<LEFT>' + name + '        ×' + item.count + '      ￥' + price + '</LEFT><BR>'
        })
      }
      content += '<BR>'
      const timeLabel = order.orderType === 'takeout' ? '配送时间' : '取餐时间'
      const timeValue = order.selectedTime || ''
      content += '<LEFT>' + timeLabel + ': ' + timeValue + '</LEFT><BR>'
      // 配送地址
      if (order.orderType === 'takeout' && order.shippingAddress) {
        const addr = typeof order.shippingAddress === 'string' 
          ? order.shippingAddress 
          : (order.shippingAddress.address || order.shippingAddress.detail || '')
        if (addr) {
          content += '<LEFT>配送地址: ' + addr + '</LEFT><BR>'
        }
      }
      content += '<BR>'
      content += '<RIGHT><font# bolder=0 height=2 width=1>实付  ￥' + (order.finalPrice || 0).toFixed(2) + '</font#></RIGHT><BR>'
      content += '<C></C><BR>'
      content += '<C></C><BR>'
      return content
    }

    // 默认模板：完整信息
    const date = new Date(order.createTime)
    let content = '<C><font# bolder=1 height=2 width=2>' + shopName + '</font#></C><BR>'
      + '<C>订单小票</C><BR>'
      + '<LEFT>订单号：' + order._id + '</LEFT><BR>'
      + '<LEFT>时间：' + date.toLocaleString() + '</LEFT><BR>'
      + '<C>--------------------------------</C><BR>'
      + '<C>菜品名称        数量    单价</C><BR>'
    if (order.goodsList && order.goodsList.length) {
      order.goodsList.forEach(item => {
        const name = (item.dishName && item.dishName.length > 12) ? item.dishName.slice(0, 10) + '..' : (item.dishName || '')
        const price = (item.price || 0).toFixed(2)
        const spaces = ' '.repeat(Math.max(1, 14 - name.length))
        content += '<LEFT>' + name + spaces + item.count + '        ￥' + price + '</LEFT><BR>'
      })
    }
    content += '<C>--------------------------------</C><BR>'
      + '<RIGHT>合计：￥' + (order.finalPrice || 0).toFixed(2) + '</RIGHT><BR>'
    // 配送地址
    if (order.orderType === 'takeout' && order.shippingAddress) {
      const addr = typeof order.shippingAddress === 'string'
        ? order.shippingAddress
        : (order.shippingAddress.address || order.shippingAddress.detail || '')
      if (addr) {
        content += '<LEFT>配送地址: ' + addr + '</LEFT><BR>'
      }
    }
    content += '<C>感谢惠顾！</C><BR>'
      + '<C>欢迎下次光临</C><BR>'
    return content
  },

  onShareAppMessage() {
    return require('../../utils/share.js').shareMessage({ title: '订单详情 - 餐饮点餐', path: '/pages/order/order' })
  },

  onShareTimeline() {
    return require('../../utils/share.js').shareTimelineMessage({ title: '订单详情 - 餐饮点餐' })
  }
})