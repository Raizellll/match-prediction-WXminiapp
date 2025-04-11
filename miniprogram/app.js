// app.js
// 更可靠的方式添加全局Trace对象
globalThis.Trace = {
  is: function() { return false; },
  not: function() { return true; },
  defined: function() { return true; }
};

// 添加全局错误处理
const originalConsoleError = console.error;
console.error = function() {
  // 忽略特定的错误信息
  if (arguments[0] && typeof arguments[0] === 'string' && 
     (arguments[0].includes('Trace is not defined') || 
      arguments[0].includes('cloud://path/to/logo'))) {
    // 忽略这个错误
    return;
  }
  // 其他错误正常显示
  return originalConsoleError.apply(console, arguments);
};

App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        env: "",
        traceUser: true,
      });
    }

    // 检查用户ID是否存在，不存在则生成
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      // 生成一个临时ID
      const tempUserId = 'user_' + Date.now();
      wx.setStorageSync('userId', tempUserId);
      console.log('已创建临时用户ID:', tempUserId);
    }

    this.globalData = {
      // 添加一个全局测试比赛ID，用于直接测试投票功能
      testMatchId: 'b80a02fd67f8d32c00371f7e6e828b55',
      // 用于记录数据更新状态
      dataUpdated: {
        matches: false, // 比赛数据是否已更新
        votes: false    // 投票数据是否已更新
      }
    };
  },
  
  // 添加全局工具函数
  goToVotePage: function(matchId) {
    if (!matchId) {
      matchId = this.globalData.testMatchId;
    }
    
    wx.navigateTo({
      url: `/pages/vote/vote?matchId=${matchId}`,
      fail: function(res) {
        console.log('跳转失败:', res);
        // 如果导航到投票页面失败，尝试重新加载页面
        wx.showModal({
          title: '提示',
          content: '页面跳转失败，是否重试？',
          success(res) {
            if (res.confirm) {
              wx.reLaunch({
                url: '/pages/index/index'
              });
            }
          }
        });
      }
    });
  },
  
  // 标记数据已更新，提醒相关页面刷新数据
  markDataUpdated: function(dataType) {
    if (!this.globalData) {
      console.error('globalData not initialized');
      return;
    }
    
    if (!this.globalData.dataUpdated) {
      this.globalData.dataUpdated = {};
    }
    
    this.globalData.dataUpdated[dataType] = true;
    
    // 保存更新状态到Storage，确保跨页面传递（特别是使用tabBar导航时）
    try {
      const storageKey = `dataUpdated_${dataType}`;
      wx.setStorageSync(storageKey, true);
      console.log(`数据已标记为更新并保存到Storage: ${dataType}`);
    } catch (e) {
      console.error('保存数据更新状态失败:', e);
    }
  },
  
  // 检查数据是否更新，用于页面判断是否需要刷新
  checkDataUpdated: function(dataType) {
    let updated = false;
    
    // 优先从Storage中获取更新状态（确保跨页面状态保持）
    try {
      const storageKey = `dataUpdated_${dataType}`;
      updated = wx.getStorageSync(storageKey) === true;
      
      // 使用后立即清除Storage中的标记
      if (updated) {
        wx.setStorageSync(storageKey, false);
      }
    } catch (e) {
      console.error('读取Storage中的数据更新状态失败:', e);
    }
    
    // 如果Storage中没有，检查内存中的状态
    if (!updated && this.globalData && this.globalData.dataUpdated) {
      updated = this.globalData.dataUpdated[dataType] === true;
      
      // 如果数据已更新，重置内存中的状态，避免重复刷新
      if (updated) {
        this.globalData.dataUpdated[dataType] = false;
      }
    }
    
    return updated;
  }
});
