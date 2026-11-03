// cloudfunctions/pay/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { body, outTradeNo, totalFee, nonceStr } = event
  const wxContext = cloud.getWXContext()

  // ⚠️ 请替换为你的微信支付商户号和云环境ID
  const MCH_ID = 'your-mch-id'        // 你的微信支付商户号
  const ENV_ID = 'your-env-id'        // 你的云开发环境ID（从云开发控制台复制）

  console.log('=== pay 云函数调用 ===')
  console.log('商户号:', MCH_ID)
  console.log('环境ID:', ENV_ID)
  console.log('订单号:', outTradeNo)
  console.log('金额(分):', totalFee)

  try {
    const result = await cloud.cloudPay.unifiedOrder({
      body: body,
      outTradeNo: outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: MCH_ID,
      totalFee: totalFee,
      envId: ENV_ID,
      functionName: 'payCallback',
      tradeType: 'JSAPI',
      openid: wxContext.OPENID,
      nonceStr: nonceStr
    })

    console.log('微信支付返回:', result)

    if (result.returnCode === 'SUCCESS' && result.resultCode === 'SUCCESS') {
      return { success: true, payment: result.payment }
    } else {
      const errorMsg = result.errCodeDes || result.returnMsg || '支付下单失败'
      return { success: false, error: errorMsg }
    }
  } catch (err) {
    console.error('支付异常', err)
    return { success: false, error: err.message }
  }
}