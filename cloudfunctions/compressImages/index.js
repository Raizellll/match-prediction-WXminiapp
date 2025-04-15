// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log('收到请求参数:', event)
    
    if (!event.fileID) {
      return {
        success: false,
        message: '缺少fileID参数'
      }
    }

    // 下载文件
    const fileRes = await cloud.downloadFile({
      fileID: event.fileID
    })
    
    if (!fileRes.fileContent) {
      return {
        success: false,
        message: '下载文件失败'
      }
    }

    // 生成新的文件名
    const timestamp = Date.now()
    const newFileName = `compressed_${timestamp}.jpg`
    
    // 上传压缩后的图片
    const uploadRes = await cloud.uploadFile({
      cloudPath: `compressed/${newFileName}`,
      fileContent: fileRes.fileContent
    })

    return {
      success: true,
      fileID: uploadRes.fileID
    }
  } catch (err) {
    console.error(err)
    return {
      success: false,
      message: err.message
    }
  }
} 