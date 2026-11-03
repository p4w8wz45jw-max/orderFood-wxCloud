const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { enable, rules } = event
  try {
    await db.collection('points_config').doc('config').update({
      data: { enable, rules, updateTime: db.serverDate() }
    })
    return { success: true }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}