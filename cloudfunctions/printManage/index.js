// cloudfunctions/printManage/index.js
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const fetch = require('node-fetch')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ⚠️ 芯烨云打印机账号（去 open.xpyun.net 免费注册，或直接在管理后台绑定打印机）
const XPYUN_USER = 'your-xpyun-account'
const XPYUN_UKEY = 'your-xpyun-ukey'

function generateSign(user, ukey, timestamp) {
  const signStr = user + ukey + timestamp
  console.log(`[DEBUG] 签名原始字符串: ${signStr}`)
  const sign = crypto.createHash('sha1').update(signStr).digest('hex')
  console.log(`[DEBUG] 计算出的签名: ${sign}`)
  return sign
}

async function requestXpyun(api, params) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const sign = generateSign(XPYUN_USER, XPYUN_UKEY, timestamp)
  const body = {
    user: XPYUN_USER,
    timestamp,
    sign,
    ...params
  }
  const url = `https://open.xpyun.net/api/openapi/xprinter/${api}`
  console.log(`[DEBUG] 请求URL: ${url}`)
  console.log(`[DEBUG] 请求参数: ${JSON.stringify(body)}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(body)
  })
  const result = await response.json()
  console.log(`[DEBUG] 芯烨云原始返回: ${JSON.stringify(result)}`)
  if (result.code !== 0 && result.code !== undefined) {
    throw new Error(`芯烨云错误 [${api}]: ${result.msg || '未知错误'} (code: ${result.code})`)
  }
  return result
}

exports.main = async (event, context) => {
  const { $url, sn, key, name, density, printSpeed, volume, content, copies, voice, voicePlayTimes, voicePlayInterval, expiresInSeconds, outTradeNo } = event

  console.log(`[DEBUG] 接收到请求，$url: ${$url}, sn: ${sn}`)

  try {
    switch ($url) {
      case 'addPrinter':
        if (!sn || !key) throw new Error('缺少打印机SN或公开码')
        await requestXpyun('addPrinter', { sn, key, name: name || '' })
        return { success: true, message: '绑定成功' }

      case 'delPrinter':
        if (!sn || !Array.isArray(sn)) throw new Error('sn必须为数组')
        await requestXpyun('delPrinter', { snList: sn })
        return { success: true, message: '解绑成功' }

      case 'getDeviceStatus':
        if (!sn) throw new Error('缺少打印机SN')
        const statusRes = await requestXpyun('queryPrinterStatus', { sn })
        return { success: true, data: statusRes }

      case 'setDensity':
        if (!sn || density === undefined) throw new Error('缺少打印机SN或浓度')
        await requestXpyun('setDensity', { sn, density })
        return { success: true, message: '设置成功' }

      case 'setPrintSpeed':
        if (!sn || printSpeed === undefined) throw new Error('缺少打印机SN或速度')
        await requestXpyun('setPrintSpeed', { sn, printSpeed })
        return { success: true, message: '设置成功' }

      case 'setVolume':
        if (!sn || volume === undefined) throw new Error('缺少打印机SN或音量')
        await requestXpyun('setVolume', { sn, volume })
        return { success: true, message: '设置成功' }

      case 'printNote':
        if (!sn || !content) throw new Error('缺少打印机SN或打印内容')
        const printParams = {
          sn,
          content,
          copies: copies || 1,
          mode: 0,
          voice: (voice !== undefined && voice !== null) ? voice : 2,  // 默认值改为 2（来单播放模式）
          voicePlayTimes: voicePlayTimes || 1,
          voicePlayInterval: voicePlayInterval || 3,
          expiresInSeconds: expiresInSeconds || 7200
        }
        if (outTradeNo) printParams.outTradeNo = outTradeNo
        await requestXpyun('print', printParams)
        return { success: true, message: '打印成功' }

      default:
        throw new Error(`未知的$url参数: ${$url}`)
    }
  } catch (err) {
    console.error(`[ERROR] ${$url} 执行失败:`, err.message)
    return { success: false, error: err.message }
  }
}