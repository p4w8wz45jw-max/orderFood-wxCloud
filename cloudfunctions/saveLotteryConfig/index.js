const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { data } = event
  if (!data) return { code: -1, message: '缺少数据' }
  try {
    // 先尝试删除已存在的记录（避免重复键）
    try {
      await db.collection('lottery_config').doc('config').remove()
    } catch(e) {}
    // 添加新记录
    await db.collection('lottery_config').add({
      data: { _id: 'config', ...data }
    })
    return { code: 0, message: '保存成功' }
  } catch (err) {
    console.error(err)
    return { code: -1, message: err.message }
  }
}