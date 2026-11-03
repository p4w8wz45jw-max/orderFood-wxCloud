// 云函数：adminSaveData
// 用于管理后台写数据库操作，绕过 _openid 权限限制
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, collection, docId, data } = event

  try {
    switch (action) {
      case 'update':
        // 更新已存在文档
        await db.collection(collection).doc(docId).update({ data })
        return { success: true, action: 'update' }

      case 'set':
        // 覆盖式写入（文档可能不存在）
        await db.collection(collection).doc(docId).set({ data })
        return { success: true, action: 'set' }

      case 'add':
        // 新增文档
        const addRes = await db.collection(collection).add({ data })
        return { success: true, action: 'add', _id: addRes._id }

      case 'remove':
        // 删除文档
        await db.collection(collection).doc(docId).remove()
        return { success: true, action: 'remove' }

      case 'get':
        // 查询单个文档
        const getRes = await db.collection(collection).doc(docId).get()
        return { success: true, action: 'get', data: getRes.data }

      case 'find':
        // 查询全部文档（绕过权限限制）
        const findRes = await db.collection(collection).get()
        return { success: true, action: 'find', data: findRes.data }

      default:
        return { success: false, error: '未知操作类型: ' + action }
    }
  } catch (err) {
    console.error('adminSaveData 执行失败', err)
    return { success: false, error: err.message }
  }
}
