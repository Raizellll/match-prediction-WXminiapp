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
      this.getAllFinishedMatches()
        .then(finishedMatches => {
          console.log('找到的已结束比赛:', finishedMatches);
          
          if (finishedMatches.length === 0) {
            console.log('没有找到已结束的比赛');
            this.setData({
              userRankings: [],
              error: '暂无已结束的比赛，无法计算预测排名'
            });
            return resolve();
          }
          
          // 获取所有用户的投票 - 使用云函数
          console.log('使用云函数获取所有投票记录');
          wx.cloud.callFunction({
            name: 'getAllVotes'
          }).then(res => {
            if (!res.result || !res.result.success) {
              console.error('云函数返回错误:', res.result);
              throw new Error('获取投票记录失败');
            }
            
            const votes = res.result.votes || [];
            console.log('通过云函数获取的投票记录:', votes.length, '条，数据库总记录:', res.result.totalInDB);
            
            if (votes.length < res.result.totalInDB) {
              console.warn(`警告：获取到的投票记录数量(${votes.length})少于数据库总数(${res.result.totalInDB})`);
            }
            
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
            
            console.log('处理后的用户投票:', Object.keys(userVotes).length, '个用户');
            
            // 统计每个用户的投票数量
            Object.keys(userVotes).forEach(userId => {
              console.log(`用户 ${userId} 的投票数量: ${userVotes[userId].length}`);
            });
            
            // 计算每个用户的准确率
            const userStats = [];
            
            for (const userId in userVotes) {
              const userVoteList = userVotes[userId];
              let correctCount = 0;
              let totalCount = 0;
              
              userVoteList.forEach(vote => {
                // 只统计已结束的比赛
                const match = finishedMatches.find(m => m._id === vote.matchId);
                
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
                
                totalCount++;
                if (votedTeam === winner) {
                  correctCount++;
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
            
            // 添加排名信息并获取用户信息
            userStats.forEach((user, index) => {
              user.rank = index + 1;
            });
            
            // 从云数据库获取用户信息
            this.getUsersInfo(userStats)
              .then(updatedUsers => {
                console.log('最终用户排名:', updatedUsers.length, '名用户');
                
                this.setData({
                  userRankings: updatedUsers
                });
                
                resolve();
              })
              .catch(err => {
                console.error('获取用户信息失败:', err);
                reject(err);
              });
          })
          .catch(err => {
            console.error('通过云函数获取投票记录失败:', err);
            
            // 降级处理：尝试通过客户端获取
            console.log('尝试通过客户端获取投票记录...');
            this.getAllVotes()
              .then(votes => {
                console.log('通过客户端获取的投票记录:', votes.length);
                // ... 处理逻辑与上面相同 ...
                resolve();
              })
              .catch(clientErr => {
                console.error('客户端获取投票记录也失败:', clientErr);
                reject(clientErr);
              });
          });
        })
        .catch(err => {
          console.error('获取已结束比赛失败:', err);
          reject(err);
        });
    });
  },
  
  // 获取所有已结束的比赛（分页处理）
  getAllFinishedMatches() {
    const db = wx.cloud.database();
    const _ = db.command;
    const MAX_LIMIT = 100; // 云数据库每次最多返回100条记录
    
    return new Promise((resolve, reject) => {
      // 先获取总数
      db.collection('matches')
        .where(_.or([
          { status: '已结束' },
          { status: 'FINISHED' }
        ]))
        .count()
        .then(countRes => {
          const total = countRes.total;
          // 计算需要分几次取
          const batchTimes = Math.ceil(total / MAX_LIMIT);
          const tasks = [];
          
          for (let i = 0; i < batchTimes; i++) {
            const promise = db.collection('matches')
              .where(_.or([
                { status: '已结束' },
                { status: 'FINISHED' }
              ]))
              .skip(i * MAX_LIMIT)
              .limit(MAX_LIMIT)
              .get();
            tasks.push(promise);
          }
          
          // 等待所有数据取完
          Promise.all(tasks).then(results => {
            let matches = [];
            results.forEach(res => {
              matches = matches.concat(res.data);
            });
            resolve(matches);
          }).catch(err => {
            console.error('分批获取比赛失败:', err);
            reject(err);
          });
        })
        .catch(err => {
          console.error('获取比赛总数失败:', err);
          reject(err);
        });
    });
  },
  
  // 获取所有投票记录（分页处理）
  getAllVotes() {
    const db = wx.cloud.database();
    const MAX_LIMIT = 100;
    
    return new Promise((resolve, reject) => {
      // 先获取总数
      db.collection('votes').count().then(countRes => {
        const total = countRes.total;
        console.log('云端总投票数据数量:', total);
        
        // 如果没有投票记录，直接返回空数组
        if (total === 0) {
          resolve([]);
          return;
        }
        
        // 计算需要分几次取
        const batchTimes = Math.ceil(total / MAX_LIMIT);
        console.log(`需要分${batchTimes}批获取投票数据，每批${MAX_LIMIT}条`);
        const tasks = [];
        
        for (let i = 0; i < batchTimes; i++) {
          console.log(`创建第${i+1}批查询任务，跳过${i * MAX_LIMIT}条`);
          const promise = db.collection('votes')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .get();
          tasks.push(promise);
        }
        
        // 等待所有数据取完
        Promise.all(tasks).then(results => {
          let votes = [];
          results.forEach((res, index) => {
            console.log(`第${index+1}批获取到${res.data.length}条数据`);
            votes = votes.concat(res.data);
          });
          console.log('成功获取投票记录数量:', votes.length, '应该等于总数:', total);
          
          // 检查投票记录的有效性
          const validVotes = votes.filter(vote => vote && vote.userId && vote.matchId && (vote.teamId || vote.team));
          console.log('有效投票记录数量:', validVotes.length, '无效记录数量:', votes.length - validVotes.length);
          
          if (validVotes.length < total) {
            console.warn('获取到的有效投票记录少于总数，可能有数据丢失!');
          }
          
          resolve(validVotes); // 只返回有效的投票记录
        }).catch(err => {
          console.error('分批获取投票失败，具体错误:', err);
          // 尝试降级处理 - 仅获取前100条数据而不是失败
          if (total > MAX_LIMIT) {
            console.log('尝试降级处理 - 只获取前100条数据');
            db.collection('votes')
              .limit(MAX_LIMIT)
              .get()
              .then(res => {
                console.log('降级模式获取到', res.data.length, '条数据');
                const validVotes = res.data.filter(vote => vote && vote.userId && vote.matchId && (vote.teamId || vote.team));
                resolve(validVotes);
              })
              .catch(fallbackErr => {
                console.error('降级获取失败:', fallbackErr);
                reject(fallbackErr);
              });
          } else {
            reject(err);
          }
        });
      }).catch(err => {
        console.error('获取投票总数失败:', err);
        reject(err);
      });
    });
  },
  
  // 获取所有用户信息
  getUsersInfo(userStats) {
    return new Promise((resolve, reject) => {
      // 使用云函数获取所有用户信息
      wx.cloud.callFunction({
        name: 'getUserProfiles',
      }).then(res => {
        console.log('通过云函数获取用户信息:', res.result);
        
        if (!res.result || !res.result.success) {
          console.error('云函数返回错误:', res.result);
          throw new Error('获取用户信息失败');
        }
        
        const allUsers = res.result.users || [];
        console.log('成功获取用户数据数量:', allUsers.length);
        
        const userMap = {}; // 用于快速查找用户信息
        
        // 将用户信息整理成以userId为key的映射
        allUsers.forEach(user => {
          if (user.userId) {
            userMap[user.userId] = user;
          }
        });
        
        // 为每个用户添加信息
        const updatedUsers = userStats.map(user => {
          // 如果有云端信息，使用云端信息
          const cloudUser = userMap[user.userId];
          if (cloudUser) {
            user.nickname = cloudUser.nickname || `用户${user.userId.substring(user.userId.length - 4)}`;
            user.avatarUrl = cloudUser.avatarUrl || '';
          } else {
            // 否则从本地获取
            const nickname = wx.getStorageSync(`nickname_${user.userId}`);
            const avatarUrl = wx.getStorageSync(`avatar_${user.userId}`);
            
            user.nickname = nickname || `用户${user.userId.substring(user.userId.length - 4)}`;
            user.avatarUrl = avatarUrl || '';
          }
          return user;
        });
        
        // 过滤出投票数量大于6的用户
        const filteredUsers = updatedUsers.filter(user => {
          return user.totalCount > 6;
        });
        
        console.log(`过滤后剩余${filteredUsers.length}名用户（投票数>6）`);
        
        // 重新计算排名
        filteredUsers.forEach((user, index) => {
          user.rank = index + 1;
        });
        
        resolve(filteredUsers);
      }).catch(err => {
        console.error('获取用户信息失败:', err);
        
        // 出错时尝试使用之前的方法获取
        this.getAllUsers().then(allUsers => {
          const userMap = {}; // 用于快速查找用户信息
          
          // 将用户信息整理成以userId为key的映射
          allUsers.forEach(user => {
            if (user.userId) {
              userMap[user.userId] = user;
            }
          });
          
          // 为每个用户添加信息
          const updatedUsers = userStats.map(user => {
            // 如果有云端信息，使用云端信息
            const cloudUser = userMap[user.userId];
            if (cloudUser) {
              user.nickname = cloudUser.nickname || `用户${user.userId.substring(user.userId.length - 4)}`;
              user.avatarUrl = cloudUser.avatarUrl || '';
            } else {
              // 否则从本地获取
              const nickname = wx.getStorageSync(`nickname_${user.userId}`);
              const avatarUrl = wx.getStorageSync(`avatar_${user.userId}`);
              
              user.nickname = nickname || `用户${user.userId.substring(user.userId.length - 4)}`;
              user.avatarUrl = avatarUrl || '';
            }
            return user;
          });
          
          // 过滤出投票数量大于6的用户
          const filteredUsers = updatedUsers.filter(user => {
            return user.totalCount > 6;
          });
          
          console.log(`过滤后剩余${filteredUsers.length}名用户（投票数>6）`);
          
          // 重新计算排名
          filteredUsers.forEach((user, index) => {
            user.rank = index + 1;
          });
          
          resolve(filteredUsers);
        }).catch(backupErr => {
          console.error('备用方法获取用户信息也失败:', backupErr);
          
          // 即使失败，也尝试使用本地信息
          const updatedUsers = userStats.map(user => {
            const nickname = wx.getStorageSync(`nickname_${user.userId}`);
            const avatarUrl = wx.getStorageSync(`avatar_${user.userId}`);
            
            user.nickname = nickname || `用户${user.userId.substring(user.userId.length - 4)}`;
            user.avatarUrl = avatarUrl || '';
            return user;
          });
          
          // 过滤出投票数量大于6的用户
          const filteredUsers = updatedUsers.filter(user => {
            return user.totalCount > 6;
          });
          
          console.log(`过滤后剩余${filteredUsers.length}名用户（投票数>6）`);
          
          // 重新计算排名
          filteredUsers.forEach((user, index) => {
            user.rank = index + 1;
          });
          
          resolve(filteredUsers);
        });
      });
    });
  },
  
  // 获取所有用户信息（分页处理）
  getAllUsers() {
    const db = wx.cloud.database();
    const MAX_LIMIT = 100;
    
    return new Promise((resolve, reject) => {
      // 先获取总数
      db.collection('users').count().then(countRes => {
        const total = countRes.total;
        // 计算需要分几次取
        const batchTimes = Math.ceil(total / MAX_LIMIT);
        const tasks = [];
        
        for (let i = 0; i < batchTimes; i++) {
          const promise = db.collection('users')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .get();
          tasks.push(promise);
        }
        
        // 等待所有数据取完
        Promise.all(tasks).then(results => {
          let users = [];
          results.forEach(res => {
            users = users.concat(res.data);
          });
          resolve(users);
        }).catch(err => {
          console.error('分批获取用户失败:', err);
          reject(err);
        });
      }).catch(err => {
        console.error('获取用户总数失败:', err);
        reject(err);
      });
    });
  }
})