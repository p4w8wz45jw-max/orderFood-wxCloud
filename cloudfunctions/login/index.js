const cloud = require('wx-server-sdk')
cloud.init({
  env: 'your-env-id'   // ⚠️ 改成你自己的云环境ID
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID
  }
}