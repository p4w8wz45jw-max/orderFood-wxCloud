const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { startBg, lotteryBg, startPopupImage, rewardPopupImage, carouselImages } = event
  try {
    await db.collection('config').doc('config').update({
      data: {
        startBg,
        lotteryBg,
        startPopupImage,
        rewardPopupImage,
        carouselImages,
        updateTime: db.serverDate()
      }
    })
    return { code: 0, message: 'success' }
  } catch (err) {
    console.error(err)
    return { code: 1, message: err.message }
  }
}