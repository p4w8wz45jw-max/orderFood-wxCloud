const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('addLotteryChance 被调用, openid:', openid)

  try {
    const userRes = await db.collection('user').where({ _openid: openid }).get()
    
    if (userRes.data.length === 0) {
      await db.collection('user').add({
        data: {
          _openid: openid,
          lotteryChance: 1,
          balance: 0,
          createTime: new Date()
        }
      })
      return { code: 0, message: '增加成功' }
    } else {
      const userId = userRes.data[0]._id
      await db.collection('user').doc(userId).update({
        data: {
          lotteryChance: _.inc(1)
        }
      })
      return { code: 0, message: '增加成功' }
    }
  } catch (err) {
    console.error(err)
    return { code: -1, message: err.message }
  }
}