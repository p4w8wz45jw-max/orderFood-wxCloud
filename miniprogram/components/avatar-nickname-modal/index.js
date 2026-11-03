Component({
  properties: {
    showAvaModal: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (newVal) {
          // 弹窗打开时重置数据
          this.setData({ avatarUrl: '', nickName: '', phoneNumber: '' })
        }
      }
    }
  },
  data: {
    avatarUrl: '',
    nickName: '',
    phoneNumber: ''
  },
  methods: {
    closeModal() {
      this.triggerEvent('saved', { cancelled: true })
    },
    noop() {},
    onChooseAvatar(e) {
      const { avatarUrl } = e.detail
      this.setData({ avatarUrl })
    },
    onNicknameInput(e) {
      this.setData({ nickName: e.detail.value })
    },
    async onGetPhoneNumber(e) {
      if (e.detail.errMsg === 'getPhoneNumber:ok') {
        try {
          const code = e.detail.code
          if (code) {
            wx.showLoading({ title: '获取中...' })
            const res = await wx.cloud.callFunction({
              name: 'getPhoneNumber',
              data: { code }
            })
            wx.hideLoading()
            const phone = res.result?.phoneNumber || ''
            if (phone) {
              this.setData({ phoneNumber: phone })
              wx.showToast({ title: '手机号已获取', icon: 'success' })
            } else {
              wx.showToast({ title: '获取失败，请重试', icon: 'none' })
            }
          } else {
            wx.showToast({ title: '获取失败，请重试', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('获取手机号失败', err)
          wx.showToast({ title: '获取失败，请重试', icon: 'none' })
        }
      }
    },
    saveInfo() {
      const { avatarUrl, nickName, phoneNumber } = this.data
      if (!phoneNumber) {
        wx.showToast({ title: '请先获取手机号', icon: 'none' })
        return
      }
      this.triggerEvent('saved', { avatarUrl, nickName, phoneNumber })
    }
  }
})