// pages/ranking/ranking.js
// 确保Trace对象可用
if (typeof Trace === 'undefined' && typeof globalThis.Trace !== 'undefined') {
  const Trace = globalThis.Trace;
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userRankings: [],
    loading: true,
    error: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadRankings();
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
    // 每次显示页面时刷新排行榜
    this.loadRankings();
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
    this.loadRankings();
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

  // 加载排行榜数据
  loadRankings() {
    console.log('开始加载排行榜数据');
    this.setData({ loading: true, error: null });
    
    this.loadUserRankings()
      .then(() => {
        console.log('排行榜数据加载完成，总用户数:', this.data.userRankings.length);
        this.setData({ loading: false });
      })
      .catch(error => {
        console.error('加载排行榜失败:', error);
        this.setData({ 
          loading: false,
          error: '加载数据失败，请稍后再试'
        });
      });
  },

  // 加载用户排名
  loadUserRankings() {
    const db = wx.cloud.database();
    const _ = db.command;
    
    return new Promise((resolve, reject) => {
      // 获取所有已结束的比赛 - 匹配多种可能的状态表示
      db.collection('matches')
        .where(_.or([
          { status: '已结束' },
          { status: 'FINISHED' }
        ]))
        .get()
        .then(matchesRes => {
          console.log('找到的已结束比赛:', matchesRes.data);
          const finishedMatches = matchesRes.data;
          
          if (finishedMatches.length === 0) {
            console.log('没有找到已结束的比赛');
            this.setData({
              userRankings: [],
              error: '暂无已结束的比赛，无法计算预测排名'
            });
            return resolve();
          }
          
          // 获取所有用户的投票
          db.collection('votes').get()
            .then(votesRes => {
              console.log('找到的投票记录:', votesRes.data);
              const votes = votesRes.data;
              
              if (votes.length === 0) {
                console.log('没有找到投票记录');
                this.setData({
                  userRankings: [],
                  error: '暂无投票记录，无法计算预测排名'
                });
                return resolve();
              }
              
              // 按用户ID分组
              const userVotes = {};
              
              votes.forEach(vote => {
                if (!vote.userId) {
                  console.log('跳过缺少userId的投票记录:', vote);
                  return;
                }
                
                if (!userVotes[vote.userId]) {
                  userVotes[vote.userId] = [];
                }
                
                userVotes[vote.userId].push(vote);
              });
              
              console.log('处理后的用户投票:', userVotes);
              
              // 计算每个用户的准确率
              const userStats = [];
              
              for (const userId in userVotes) {
                const userVoteList = userVotes[userId];
                let correctCount = 0;
                let totalCount = 0;
                
                userVoteList.forEach(vote => {
                  // 只统计已结束的比赛
                  const match = finishedMatches.find(m => m._id === vote.matchId);
                  console.log('检查投票:', vote.matchId, match ? '找到匹配的比赛' : '未找到匹配的比赛');
                  
                  if (!match) return;
                  
                  // 检查结果字段
                  if (!match.result) {
                    console.log('比赛缺少result字段:', match._id);
                    return;
                  }
                  
                  // 检查获胜者
                  const winner = match.result.winner;
                  if (!winner) {
                    console.log('比赛缺少winner字段:', match._id);
                    return;
                  }
                  
                  // 检查投票的teamId字段
                  const votedTeam = vote.teamId || vote.team; // 兼容两种字段名
                  if (!votedTeam) {
                    console.log('投票缺少team/teamId字段:', vote);
                    return;
                  }
                  
                  console.log('比赛获胜者:', winner, '用户投票:', votedTeam);
                  totalCount++;
                  if (votedTeam === winner) {
                    correctCount++;
                    console.log(`用户${userId}预测正确:`, vote.matchId);
                  } else {
                    console.log(`用户${userId}预测错误:`, vote.matchId, '用户投票:', votedTeam, '实际获胜:', winner);
                  }
                });
                
                console.log(`用户 ${userId} 统计: 正确 ${correctCount}/${totalCount}`);
                
                // 无论是否有参与已结束比赛，都添加到排行榜
                userStats.push({
                  userId: userId,
                  correctCount: correctCount,
                  totalCount: totalCount,
                  accuracy: totalCount > 0 ? (correctCount / totalCount * 100).toFixed(2) : "0.00"
                });
              }
              
              // 按准确率排序
              userStats.sort((a, b) => {
                // 先按准确率降序排列
                if (parseFloat(b.accuracy) !== parseFloat(a.accuracy)) {
                  return parseFloat(b.accuracy) - parseFloat(a.accuracy);
                }
                // 如果准确率相同，按正确预测数量降序
                if (b.correctCount !== a.correctCount) {
                  return b.correctCount - a.correctCount;
                }
                // 最后按参与比赛数量降序
                return b.totalCount - a.totalCount;
              });
              
              // 添加排名信息
              userStats.forEach((user, index) => {
                user.rank = index + 1;
                
                // 尝试获取用户昵称和头像
                const nickname = wx.getStorageSync(`nickname_${user.userId}`);
                const avatarUrl = wx.getStorageSync(`avatar_${user.userId}`);
                
                if (nickname) {
                  user.nickname = nickname;
                } else {
                  // 创建一个匿名名称
                  user.nickname = `用户${user.userId.substring(user.userId.length - 4)}`;
                }
                
                // 添加头像URL
                user.avatarUrl = avatarUrl || '';
              });
              
              console.log('最终用户排名:', userStats);
              
              this.setData({
                userRankings: userStats
              });
              
              resolve();
            })
            .catch(err => {
              console.error('获取用户投票失败:', err);
              reject(err);
            });
        })
        .catch(err => {
          console.error('获取已结束比赛失败:', err);
          reject(err);
        });
    });
  }
})