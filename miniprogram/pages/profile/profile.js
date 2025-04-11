// pages/profile/profile.js
// 确保Trace对象可用
if (typeof Trace === 'undefined' && typeof globalThis.Trace !== 'undefined') {
  const Trace = globalThis.Trace;
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userId: '',
    nickname: '',
    avatarUrl: '', // 用户头像URL
    votingStats: {
      totalVotes: 0,
      correctPredictions: 0,
      accuracy: '0.00'
    },
    voteHistory: [],
    activeTab: 0, // 0: 投票历史, 1: 个人设置
    loading: true,
    error: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.initUserInfo();
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
    this.loadUserData();
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
    this.loadUserData(() => {
      wx.stopPullDownRefresh();
    });
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

  // 初始化用户信息
  initUserInfo() {
    // 获取用户ID
    let userId = wx.getStorageSync('userId');
    if (!userId) {
      console.log('未找到用户ID，创建临时ID');
      userId = 'user_' + Date.now();
      wx.setStorageSync('userId', userId);
    }
    
    // 获取用户昵称
    let nickname = wx.getStorageSync(`nickname_${userId}`);
    if (!nickname) {
      nickname = `用户${userId.substring(userId.length - 4)}`;
    }
    
    // 获取用户头像
    let avatarUrl = wx.getStorageSync(`avatar_${userId}`);
    
    this.setData({
      userId: userId,
      nickname: nickname,
      avatarUrl: avatarUrl
    });
    
    this.loadUserData();
  },
  
  // 加载用户数据
  loadUserData(callback) {
    this.setData({ loading: true, error: null });
    
    Promise.all([
      this.loadVotingStats(),
      this.loadVoteHistory()
    ])
    .then(() => {
      this.setData({ loading: false });
      if (callback) callback();
    })
    .catch(error => {
      console.error('加载用户数据失败:', error);
      this.setData({ 
        loading: false,
        error: '加载数据失败，请稍后再试'
      });
      if (callback) callback();
    });
  },
  
  // 加载投票统计
  loadVotingStats() {
    const db = wx.cloud.database();
    const _ = db.command;
    
    return new Promise((resolve, reject) => {
      // 获取所有已结束的比赛
      db.collection('matches')
        .where(_.or([
          { status: '已结束' },
          { status: 'FINISHED' }
        ]))
        .get()
        .then(matchesRes => {
          const finishedMatches = matchesRes.data;
          console.log('找到已结束比赛:', finishedMatches.length, '场');
          
          // 获取用户的投票
          db.collection('votes')
            .where({
              userId: this.data.userId
            })
            .get()
            .then(votesRes => {
              const votes = votesRes.data;
              const totalVotes = votes.length;
              let correctPredictions = 0;
              let predictedFinishedMatches = 0; // 已结束比赛的投票数
              
              votes.forEach(vote => {
                // 找到对应的比赛
                const match = finishedMatches.find(m => m._id === vote.matchId);
                
                // 只统计已结束的比赛
                if (!match) return;
                
                // 检查结果是否存在
                if (!match.result || !match.result.winner) {
                  console.log('比赛已结束但缺少结果:', match._id);
                  return;
                }
                
                // 累计已结束比赛的投票
                predictedFinishedMatches++;
                
                // 判断预测是否正确 - 使用teamId而不是team
                if (vote.teamId === match.result.winner) {
                  correctPredictions++;
                  console.log('预测正确:', vote.matchId, vote.teamId);
                } else {
                  console.log('预测错误:', vote.matchId, '用户投票:', vote.teamId, '实际获胜:', match.result.winner);
                }
              });
              
              // 计算准确率 - 正确预测数 / 已结束比赛的投票数
              const accuracy = predictedFinishedMatches > 0 
                ? (correctPredictions / predictedFinishedMatches * 100).toFixed(2)
                : '0.00';
              
              console.log(`准确率计算: ${correctPredictions}/${predictedFinishedMatches} = ${accuracy}%`);
              
              this.setData({
                'votingStats.totalVotes': totalVotes,
                'votingStats.correctPredictions': correctPredictions,
                'votingStats.accuracy': accuracy
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
  },
  
  // 加载投票历史
  loadVoteHistory() {
    const db = wx.cloud.database();
    
    return new Promise((resolve, reject) => {
      db.collection('votes')
        .where({
          userId: this.data.userId
        })
        .orderBy('createTime', 'desc') // 使用createTime替代voteTime
        .get()
        .then(votesRes => {
          const votes = votesRes.data;
          
          if (votes.length === 0) {
            this.setData({
              voteHistory: []
            });
            return resolve();
          }
          
          // 获取对应的比赛信息
          const matchIds = [...new Set(votes.map(v => v.matchId))];
          
          // 由于小程序限制，一次最多查询20个记录，所以需要分批查询
          const batchSize = 20;
          const matchQueries = [];
          
          for (let i = 0; i < matchIds.length; i += batchSize) {
            const batchIds = matchIds.slice(i, i + batchSize);
            const query = db.collection('matches')
              .where({
                _id: db.command.in(batchIds)
              })
              .get();
            
            matchQueries.push(query);
          }
          
          Promise.all(matchQueries)
            .then(results => {
              // 合并所有结果
              let matches = [];
              results.forEach(res => {
                matches = matches.concat(res.data);
              });
              
              // 将投票记录和比赛信息关联起来
              const voteHistory = votes.map(vote => {
                const match = matches.find(m => m._id === vote.matchId);
                if (!match) {
                  console.log('未找到匹配的比赛:', vote.matchId);
                  return null;
                }
                
                // 提取队伍名称
                const team1Name = this.extractTeamName(match.team1);
                const team2Name = this.extractTeamName(match.team2);
                
                // 获取投票队伍的名称
                let votedTeamName = '未知队伍';
                
                // 检查投票的队伍ID是否与队伍1或队伍2的ID匹配
                if (match.team1 && (vote.teamId === match.team1._id)) {
                  votedTeamName = team1Name;
                } else if (match.team2 && (vote.teamId === match.team2._id)) {
                  votedTeamName = team2Name;
                }
                
                // 格式化时间
                let formattedTime = vote.createTime ? vote.createTime : new Date();
                if (formattedTime instanceof Date) {
                  formattedTime = formattedTime.toLocaleString();
                } else if (typeof formattedTime === 'string') {
                  try {
                    const date = new Date(formattedTime);
                    formattedTime = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                  } catch(e) {
                    console.error('时间格式化失败:', e);
                  }
                }
                
                return {
                  _id: vote._id,
                  matchId: vote.matchId,
                  teamId: vote.teamId, // 使用teamId代替team
                  teamName: votedTeamName,
                  voteTime: formattedTime,
                  matchTitle: match.title || '未知比赛',
                  matchStatus: match.status || '未知',
                  team1: team1Name,
                  team2: team2Name,
                  result: match.result || null,
                  isCorrect: match.result && match.result.winner === vote.teamId // 使用teamId判断是否正确
                };
              }).filter(item => item !== null);
              
              this.setData({
                voteHistory: voteHistory
              });
              
              resolve();
            })
            .catch(err => {
              console.error('获取比赛信息失败:', err);
              reject(err);
            });
        })
        .catch(err => {
          console.error('获取投票历史失败:', err);
          reject(err);
        });
    });
  },
  
  // 从不同格式的队伍数据中提取队伍名称
  extractTeamName(teamData) {
    if (!teamData) return '未知队伍';
    
    if (typeof teamData === 'string') {
      return teamData;
    }
    
    if (typeof teamData === 'object') {
      // 处理对象形式的团队数据
      if (teamData.name) {
        return teamData.name;
      } else if (teamData._id) {
        // 如果有ID属性但没有name属性
        return `队伍${teamData._id}`;
      } else if (Object.prototype.toString.call(teamData) === '[object Object]') {
        // 尝试找到对象中可能的名称字段
        const possibleNameFields = ['name', 'teamName', 'team_name', 'title', 'label'];
        for (const field of possibleNameFields) {
          if (teamData[field] && typeof teamData[field] === 'string') {
            return teamData[field];
          }
        }
        
        // 如果没有找到特定名称字段，返回第一个字符串值
        for (const key in teamData) {
          if (typeof teamData[key] === 'string') {
            return teamData[key]; // 返回找到的第一个字符串值
          }
        }
      }
    }
    
    return '未知队伍';
  },
  
  // 切换标签页
  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      activeTab: index
    });
  },
  
  // 更新昵称
  updateNickname(e) {
    const nickname = e.detail.value.trim();
    
    if (!nickname) {
      wx.showToast({
        title: '昵称不能为空',
        icon: 'none'
      });
      return;
    }
    
    wx.setStorageSync(`nickname_${this.data.userId}`, nickname);
    
    this.setData({
      nickname: nickname
    });
    
    wx.showToast({
      title: '昵称已更新',
      icon: 'success'
    });
  },
  
  // 跳转到比赛详情
  goToMatch(e) {
    // 移除跳转逻辑，用户点击不再执行任何操作
    return;
  },
  
  // 选择并上传头像
  chooseAvatar() {
    const that = this;
    
    // 选择图片
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const tempFilePath = res.tempFilePaths[0];
        console.log('选择的图片:', tempFilePath);
        
        wx.showLoading({
          title: '上传中...',
          mask: true
        });
        
        // 上传到云存储
        that.uploadToCloud(tempFilePath);
      },
      fail: function(err) {
        console.error('选择图片失败:', err);
      }
    });
  },
  
  // 上传图片到云存储
  uploadToCloud(filePath) {
    const that = this;
    const cloudPath = `avatars/${this.data.userId}_${Date.now()}${filePath.match(/\.[^.]+?$/)[0]}`;
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: res => {
        console.log('上传成功，文件ID:', res.fileID);
        
        // 保存头像URL
        wx.setStorageSync(`avatar_${that.data.userId}`, res.fileID);
        
        that.setData({
          avatarUrl: res.fileID
        });
        
        wx.hideLoading();
        wx.showToast({
          title: '头像已更新',
          icon: 'success'
        });
      },
      fail: err => {
        console.error('上传失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: '上传失败，请重试',
          icon: 'none'
        });
      }
    });
  }
})