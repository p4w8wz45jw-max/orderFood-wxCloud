// cloudfunctions/getPhoneNumber/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { code } = event
  console.log('接收到code:', code)
  try {
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    console.log('API原始返回:', JSON.stringify(res))
    
    // 兼容不同版本的返回格式
    if (res.phoneInfo && res.phoneInfo.phoneNumber) {
      return { success: true, phoneNumber: res.phoneInfo.phoneNumber }
    }
    // 有些版本返回 data
    if (res.data && res.data.phoneNumber) {
      return { success: true, phoneNumber: res.data.phoneNumber }
    }
    // errMsg可能是 "phonenumber.getPhoneNumber:ok" 格式
    if (res.errMsg && res.errMsg.indexOf('ok') !== -1 && res.phoneInfo) {
      return { success: true, phoneNumber: res.phoneInfo.phoneNumber }
    }
    // 未识别格式
    return { success: false, message: '返回格式异常', raw: JSON.stringify(res) }
  } catch (err) {
    console.error('云函数执行失败:', err)
    return { success: false, message: err.message || err.errMsg || String(err) }
  }
}