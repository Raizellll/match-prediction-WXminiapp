// pages/match/match.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    matches: [],
    loading: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadMatches();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadMatches();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  loadMatches() {
    const db = wx.cloud.database();
    this.setData({ loading: true });
    
    // 添加更多调试日志
    console.log('开始加载比赛列表');
    
    db.collection('matches')
      .get()
      .then(res => {
        console.log('获取的比赛数据原始格式:', res.data);
        
        // 处理数据，转换图片路径和处理数据结构
        const processedMatches = res.data.map(match => {
          // 创建一个全新的对象，避免引用原始数据中可能有问题的字段
          return {
            _id: match._id || '',
            title: match.tournament_name || match.title || '比赛',
            matchTime: (match.date || '') + ' ' + (match.time || ''),
            team1: typeof match.team1 === 'object' ? match.team1.name : (match.team1 || 'TEAM A'),
            team2: typeof match.team2 === 'object' ? match.team2.name : (match.team2 || 'TEAM B'), 
            status: match.status || '未知',
            // 简化比分信息
            team1Score: match.result && match.result.team1_score ? match.result.team1_score : 0,
            team2Score: match.result && match.result.team2_score ? match.result.team2_score : 0
          };
        });
        
        console.log('处理后的比赛数据:', processedMatches);
        
        this.setData({
          matches: processedMatches,
          loading: false
        });
        
        // 打印第一场比赛的ID，便于调试
        if (processedMatches.length > 0) {
          console.log('第一场比赛ID:', processedMatches[0]._id);
          // 启用测试按钮
          this.setData({
            firstMatchId: processedMatches[0]._id
          });
        }
      })
      .catch(err => {
        console.error('加载比赛列表失败:', err);
        wx.showToast({
          title: '加载比赛列表失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      });
  },

  goToVote(e) {
    const matchId = e.currentTarget.dataset.id;
    console.log('跳转到投票页面, matchId:', matchId);
    
    // 确保有合法的ID
    if (!matchId) {
      wx.showToast({
        title: '无效的比赛ID',
        icon: 'none'
      });
      return;
    }
    
    // 显示加载中提示
    wx.showLoading({
      title: '加载中',
      mask: true
    });
    
    wx.navigateTo({
      url: `/pages/vote/vote?matchId=${matchId}`,
      success: function(res) {
        console.log('跳转成功:', res);
        wx.hideLoading();
      },
      fail: function(res) {
        console.error('跳转到投票页面失败:', res);
        wx.hideLoading();
        wx.showToast({
          title: '页面跳转失败: ' + res.errMsg,
          icon: 'none'
        });
      }
    });
  },
  
  // 调试用的直接跳转函数
  debugGoToVote(e) {
    // 从数据获取第一个比赛的ID
    const matchId = this.data.firstMatchId || e.currentTarget.dataset.id;
    console.log('调试跳转, matchId:', matchId);
    
    if (!matchId) {
      wx.showToast({
        title: '没有可用的比赛ID',
        icon: 'none'
      });
      return;
    }
    
    // 显示加载中提示
    wx.showLoading({
      title: '加载中',
      mask: true
    });
    
    wx.navigateTo({
      url: `/pages/vote/vote?matchId=${matchId}`,
      success: function(res) {
        console.log('跳转成功:', res);
        wx.hideLoading();
      },
      fail: function(res) {
        console.error('调试跳转失败:', res);
        wx.hideLoading();
        wx.showToast({
          title: '调试跳转失败: ' + res.errMsg,
          icon: 'none',
          duration: 3000
        });
      }
    });
  }
})