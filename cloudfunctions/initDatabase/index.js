// cloudfunctions/initDatabase/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 需要检查并创建的集合列表（核心业务集合）
const collections = [
  'admin',
  'config',
  'coupon',
  'deliveryConfig',
  'dish',
  'dishCategory',
  'groupBuy',
  'lottery_config',
  'lottery_records',
  'notice',
  'order',
  'payConfig',
  'points_config',
  'points_log',
  'printer',
  'rechargeOptions',
  'shopinfo',
  'ticket_packages',
  'user',
  'user_coupons'
]

// 默认配置文档
const defaultDocs = {
  config: {
    _id: 'config',
    startBg: '',
    lotteryBg: '',
    startPopupImage: '',
    rewardPopupImage: '',
    rechargeNotice: ''
  },
  shopinfo: {
    name: '我的店铺',
    intro: '',
    businessHours: '',
    address: '',
    contactPhone: '',
    description: '',
    location: { lat: null, lng: null },
    deliveryFeeRules: { baseFee: 3, baseDistance: 3000, perKmFee: 2, maxDistance: 20000 },
    minDeliveryAmount: 0,
    adminPushSettings: { enableNewOrderMsg: false, newOrderMsgTemplateId: '' },
    themeColor: '#e54d42',
    timeSlots: []
  },
  payConfig: {
    _id: 'payConfig',
    mchId: '',
    apiKey: '',
    notifyUrl: ''
  },
  points_config: {
    _id: 'config',
    enable: false,
    rules: []
  },
  lottery_config: {
    _id: 'config',
    enable: false,
    dailyLimit: 1,
    rules: []
  },
  deliveryConfig: {
    mapKey: '',
    shopLat: 0,
    shopLng: 0,
    tiers: [
      { min: 0, max: 2, fee: 0 },
      { min: 2, max: 5, fee: 5 },
      { min: 5, max: 10, fee: 10 }
    ]
  }
}

exports.main = async (event, context) => {
  const results = []
  try {
    // 1. 创建集合（如果不存在）
    for (const col of collections) {
      try {
        await db.createCollection(col)
        results.push(`${col} 集合创建成功`)
      } catch (err) {
        if (err.errCode === -502005) {
          results.push(`${col} 集合已存在`)
        } else {
          results.push(`${col} 集合创建失败：${err.message}`)
        }
      }
    }

    // 2. 插入默认文档
    for (const [colName, docData] of Object.entries(defaultDocs)) {
      try {
        const col = db.collection(colName)
        const res = await col.doc(docData._id).get()
        if (res.data) {
          results.push(`${colName} 配置文档已存在，跳过`)
        } else {
          await col.add({ data: docData })
          results.push(`${colName} 默认文档创建成功`)
        }
      } catch (err) {
        if (err.errCode === -502005) {
          // 文档不存在，直接添加
          await db.collection(colName).add({ data: docData })
          results.push(`${colName} 默认文档创建成功`)
        } else {
          results.push(`${colName} 文档创建失败：${err.message}`)
        }
      }
    }

    return { success: true, results }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}