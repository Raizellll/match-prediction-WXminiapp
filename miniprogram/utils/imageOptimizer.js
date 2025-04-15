// 图片优化工具
const imageOptimizer = {
  /**
   * 压缩图片
   * @param {string} fileID - 云存储文件ID
   * @param {Object} options - 压缩选项
   * @param {number} options.quality - 压缩质量 (1-100)
   * @param {number} options.width - 目标宽度 (可选)
   * @param {number} options.height - 目标高度 (可选)
   * @param {string} options.format - 目标格式 (webp, jpeg, png)
   * @returns {Promise<Object>} - 压缩结果
   */
  compressImage: function(fileID, options = {}) {
    const defaultOptions = {
      quality: 80,
      format: 'webp'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    return new Promise((resolve, reject) => {
      wx.showLoading({
        title: '图片处理中...',
        mask: true
      });
      
      wx.cloud.callFunction({
        name: 'compressImages',
        data: {
          fileID: fileID,
          ...finalOptions
        }
      })
      .then(res => {
        wx.hideLoading();
        console.log('图片压缩成功:', res.result);
        
        if (res.result && res.result.success && res.result.fileID) {
          resolve({
            success: true,
            compressedFileID: res.result.fileID,
            originalSize: res.result.originalSize || 0,
            compressedSize: res.result.compressedSize || 0,
            compressionRatio: res.result.compressionRatio || 0
          });
        } else {
          reject(new Error(res.result && res.result.message || '图片压缩失败'));
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('图片压缩失败:', err);
        reject(err);
      });
    });
  },
  
  /**
   * 上传并自动压缩图片
   * @param {Object} options - 压缩选项
   * @returns {Promise<string>} - 压缩后的图片fileID
   */
  uploadAndCompress: function(options = {}) {
    return new Promise((resolve, reject) => {
      // 选择图片
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: res => {
          const filePath = res.tempFilePaths[0];
          const cloudPath = `images/${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
          
          // 先上传原图
          wx.showLoading({
            title: '上传中...',
            mask: true
          });
          
          wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath,
            success: uploadRes => {
              if (!uploadRes.fileID) {
                wx.hideLoading();
                reject(new Error('上传失败：未获取到文件ID'));
                return;
              }

              console.log('原图上传成功:', uploadRes.fileID);
              
              // 压缩图片
              this.compressImage(uploadRes.fileID, options)
                .then(compressResult => {
                  if (!compressResult.compressedFileID) {
                    throw new Error('压缩失败：未获取到压缩后的文件ID');
                  }

                  // 如果原图已经够小或者压缩效果不好，则删除压缩图片，使用原图
                  if (compressResult.originalSize <= 200 * 1024 || 
                      compressResult.compressionRatio <= 5) {
                    console.log('原图足够小或压缩效果不明显，使用原图');
                    
                    // 删除压缩图
                    wx.cloud.deleteFile({
                      fileList: [compressResult.compressedFileID]
                    });
                    
                    wx.hideLoading();
                    resolve(uploadRes.fileID);
                  } else {
                    console.log('使用压缩后的图片');
                    // 删除原图
                    wx.cloud.deleteFile({
                      fileList: [uploadRes.fileID]
                    });
                    
                    wx.hideLoading();
                    resolve(compressResult.compressedFileID);
                  }
                })
                .catch(compressErr => {
                  console.error('压缩失败，使用原图:', compressErr);
                  wx.hideLoading();
                  resolve(uploadRes.fileID);
                });
            },
            fail: err => {
              wx.hideLoading();
              console.error('上传图片失败:', err);
              reject(err);
            }
          });
        },
        fail: err => {
          console.error('选择图片失败:', err);
          reject(err);
        }
      });
    });
  }
};

module.exports = imageOptimizer; 