// pages/vote/vote.js
// 确保Trace对象可用
if (typeof Trace === 'undefined' && typeof globalThis.Trace !== 'undefined') {
  const Trace = globalThis.Trace;
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    currentMatchId: '',
    currentUserId: '',
    matchInfo: null,
    votedTeam: null,
    hasVoted: false,
    team1Score: 0,
    team2Score: 0,
    team1Votes: 0,
    team2Votes: 0,
    loading: true,
    errorMessage: null,
    debugMode: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('Vote页面参数:', options);
    if (!options.id) {
      this.setData({
        loading: false,
        errorMessage: '未提供比赛ID'
      });
      return;
    }

    // 获取用户ID
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      const newUserId = 'user_' + Date.now();
      wx.setStorageSync('userId', newUserId);
      this.setData({ currentUserId: newUserId });
    } else {
      this.setData({ currentUserId: userId });
    }

    this.setData({ 
      currentMatchId: options.id,
      debugMode: wx.getStorageSync('debugMode') || false
    });
    
    this.loadMatchInfo();
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

  loadMatchInfo() {
    const db = wx.cloud.database();
    
    // 获取比赛信息
    db.collection('matches').doc(this.data.currentMatchId).get()
      .then(res => {
        console.log('获取比赛信息成功:', res.data);
        const matchInfo = res.data;
        
        // 检查用户是否已投票
        return db.collection('votes')
          .where({
            matchId: this.data.currentMatchId,
            userId: this.data.currentUserId
          })
          .get()
          .then(voteRes => {
            console.log('获取投票记录:', voteRes.data);
            const hasVoted = voteRes.data.length > 0;
            const votedTeam = hasVoted ? voteRes.data[0].teamId : null;

            // 获取投票统计
            return db.collection('votes')
              .where({
                matchId: this.data.currentMatchId
              })
              .get()
              .then(statsRes => {
                console.log('获取投票统计:', statsRes.data);
                const votes = statsRes.data;
                const team1Votes = votes.filter(v => v.teamId === matchInfo.team1Id).length;
                const team2Votes = votes.filter(v => v.teamId === matchInfo.team2Id).length;

                this.setData({
                  matchInfo,
                  hasVoted,
                  votedTeam,
                  team1Votes,
                  team2Votes,
                  loading: false
                });
              });
          });
      })
      .catch(err => {
        console.error('加载比赛信息失败:', err);
        this.setData({
          loading: false,
          errorMessage: err.message || '加载失败'
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

  submitVote(e) {
    if (this.data.hasVoted) {
      wx.showToast({
        title: '您已经投过票了',
        icon: 'none'
      });
      return;
    }

    const teamId = e.currentTarget.dataset.vote;
    const db = wx.cloud.database();

    wx.showLoading({
      title: '提交投票...',
      mask: true
    });

    // 检查并确保用户信息存在于数据库
    console.log('开始检查用户是否存在:', this.data.currentUserId);
    db.collection('users').where({
      userId: this.data.currentUserId
    }).get().then(userRes => {
      console.log('检查用户结果:', userRes.data);
      if (userRes.data.length === 0) {
        // 如果用户不存在，先创建用户记录
        const nickname = wx.getStorageSync(`nickname_${this.data.currentUserId}`) || `用户${this.data.currentUserId.substring(this.data.currentUserId.length - 4)}`;
        const avatarUrl = wx.getStorageSync(`avatar_${this.data.currentUserId}`) || '';
        
        console.log('创建新用户记录:', this.data.currentUserId, '昵称:', nickname);
        return db.collection('users').add({
          data: {
            userId: this.data.currentUserId,
            nickname: nickname,
            avatarUrl: avatarUrl,
            createTime: db.serverDate(),
            create_platform: '投票页'
          }
        }).then(res => {
          console.log('创建用户记录成功:', res);
          // 继续添加投票
          return db.collection('votes').add({
            data: {
              matchId: this.data.currentMatchId,
              userId: this.data.currentUserId,
              teamId: teamId,
              createTime: db.serverDate()
            }
          });
        }).catch(err => {
          console.error('创建用户记录失败，错误详情:', err);
          // 尝试直接添加投票
          return db.collection('votes').add({
            data: {
              matchId: this.data.currentMatchId,
              userId: this.data.currentUserId,
              teamId: teamId,
              createTime: db.serverDate()
            }
          });
        });
      } else {
        console.log('用户已存在:', userRes.data[0]);
        // 用户已存在，直接添加投票
        return db.collection('votes').add({
          data: {
            matchId: this.data.currentMatchId,
            userId: this.data.currentUserId,
            teamId: teamId,
            createTime: db.serverDate()
          }
        });
      }
    })
    .then(res => {
      console.log('投票添加成功:', res);
      // 标记数据已更新
      const app = getApp();
      if (app.markDataUpdated) {
        app.markDataUpdated('votes');
      }

      // 重新加载比赛信息以更新UI
      this.loadMatchInfo();

      wx.hideLoading();
      wx.showToast({
        title: '投票成功',
        icon: 'success'
      });
    })
    .catch(err => {
      console.error('投票过程失败，错误详情:', err);
      wx.hideLoading();
      wx.showToast({
        title: '投票失败，请重试 ' + (err.errMsg || ''),
        icon: 'none',
        duration: 3000
      });
    });
  },

  goBack() {
    wx.navigateBack();
  }
})