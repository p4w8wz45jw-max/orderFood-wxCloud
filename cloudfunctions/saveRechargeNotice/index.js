const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { rechargeNotice } = event
  try {
    // 先检查文档是否存在
    const doc = await db.collection('config').doc('config').get()
    // 存在则更新（不包含 _id）
    await db.collection('config').doc('config').update({
      data: {
        rechargeNotice: rechargeNotice,
        updateTime: db.serverDate()
      }
    })
    return { success: true }
  } catch (err) {
    // 文档不存在则创建
    if (err.errCode === -502005) {
      await db.collection('config').add({
        data: {
          _id: 'config',
          rechargeNotice: rechargeNotice,
          createTime: db.serverDate()
        }
      })
      return { success: true }
    }
    return { success: false, error: err.message }
  }
}