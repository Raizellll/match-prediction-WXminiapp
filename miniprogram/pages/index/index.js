Page({
  data: {
    matches: [],
    filteredMatches: [],
    selectedDate: 'all',
    dateList: [],
    loading: true,
    targetMatchId: null,
    currentDateId: 'date-all' // 当前日期ID，用于滚动到对应日期
  },

  onLoad(options) {
    this.loadMatches();
    
    // 如果存在matchId参数，滚动到对应比赛
    if (options && options.matchId) {
      this.setData({
        targetMatchId: options.matchId
      });
    }
  },

  onShow() {
    const app = getApp();
    let needRefresh = false;
    
    // 检查是否有数据更新标记
    if (app.globalData && app.checkDataUpdated) {
      if (app.checkDataUpdated('matches')) {
        console.log('检测到比赛数据已更新，重新加载列表');
        needRefresh = true;
      }
      
      if (app.checkDataUpdated('votes')) {
        console.log('检测到投票数据已更新，重新加载列表');
        needRefresh = true;
      }
    }
    
    // 检查Storage中的直接标记
    try {
      const forceRefresh = wx.getStorageSync('forceRefreshIndexPage');
      if (forceRefresh) {
        console.log('检测到强制刷新标记，重新加载列表');
        wx.setStorageSync('forceRefreshIndexPage', false);
        needRefresh = true;
      }
    } catch (e) {
      console.error('读取刷新标记失败:', e);
    }
    
    // 执行刷新
    if (needRefresh) {
      this.loadMatches();
    }
  },

  // 当页面渲染完成后，滚动到目标比赛
  onReady() {
    if (this.data.targetMatchId) {
      // 延迟执行，确保比赛列表已渲染
      setTimeout(() => {
        const query = wx.createSelectorQuery();
        query.select(`#match-${this.data.targetMatchId}`).boundingClientRect();
        query.selectViewport().scrollOffset();
        query.exec(res => {
          if (res[0]) {
            wx.pageScrollTo({
              scrollTop: res[0].top,
              duration: 300
            });
          }
        });
      }, 500);
    }
  },

  // 选择最接近当前日期的日期
  selectNearestDate(today, dateList) {
    if (dateList.length === 0) {
      this.selectDate({ currentTarget: { dataset: { date: 'all' } } });
      return;
    }
    
    const todayTimestamp = today.getTime();
    let nearestDate = 'all';
    let minDiff = Infinity;
    let futureDate = null;
    let exactToday = null;
    
    // 格式化今天的日期为yyyy-MM-dd形式，用于精确匹配
    const todayFormatted = this.formatDateYMD(today);
    
    // 寻找最接近的日期
    dateList.forEach(dateItem => {
      try {
        // 如果找到了精确匹配今天的日期，直接记录
        if (dateItem.date === todayFormatted) {
          exactToday = dateItem.date;
        }
        
        const dateFormatted = dateItem.date.replace(/-/g, '/');
        const dateTimestamp = new Date(dateFormatted).getTime();
        const diff = Math.abs(dateTimestamp - todayTimestamp);
        
        // 更新最接近的日期
        if (diff < minDiff) {
          minDiff = diff;
          nearestDate = dateItem.date;
        }
        
        // 记录未来日期中最近的一个
        if (dateTimestamp >= todayTimestamp && (futureDate === null || dateTimestamp < new Date(futureDate.replace(/-/g, '/')).getTime())) {
          futureDate = dateItem.date;
        }
      } catch(err) {
        console.error('日期处理错误:', err);
      }
    });
    
    // 优先使用今天的日期，其次是最近的未来日期，最后是最接近的日期
    const dateToSelect = exactToday || futureDate || nearestDate;
    this.selectDate({ currentTarget: { dataset: { date: dateToSelect } } });
  },

  // 加载比赛数据
  loadMatches() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const userId = wx.getStorageSync('userId') || '';
    // 保存当前选择的日期
    const currentSelectedDate = this.data.selectedDate;

    // 获取所有比赛
    db.collection('matches')
      .orderBy('date', 'desc') // 降序排列，最新的比赛在前
      .get()
      .then(res => {
        const matches = res.data;
        const dateMap = new Map();
        
        // 处理日期列表
        matches.forEach(match => {
          // 确保日期格式一致
          const datePart = match.date.split(' ')[0]; // 只取日期部分 2025-05-11
          if (!dateMap.has(datePart)) {
            try {
              // 将横杠日期转换为斜杠格式以兼容iOS
              const dateForParsing = datePart.replace(/-/g, '/');
              const dateObj = new Date(dateForParsing);
              
              const [year, month, day] = datePart.split('-');
              const weekday = this.getWeekday(dateObj);
              dateMap.set(datePart, {
                date: datePart,
                displayDate: `${month}月${day}日`,
                weekday: weekday
              });
            } catch(err) {
              console.error('日期处理错误:', err);
            }
          }
        });

        // 转换为数组并排序
        const dateList = Array.from(dateMap.values()).sort((a, b) => {
          try {
            // iOS兼容的日期比较
            const dateA = a.date.replace(/-/g, '/');
            const dateB = b.date.replace(/-/g, '/');
            return new Date(dateA) - new Date(dateB); // 升序排列
          } catch(err) {
            console.error('日期排序错误:', err);
            return 0;
          }
        });

        // 获取用户投票记录
        return db.collection('votes')
          .where({
            userId: userId
          })
          .get()
          .then(voteRes => {
            // 创建投票映射
            const voteMap = new Map();
            voteRes.data.forEach(vote => {
              voteMap.set(vote.matchId, vote.teamId);
            });

            // 获取每场比赛的投票统计
            const matchPromises = matches.map(match => {
              return db.collection('votes')
                .where({
                  matchId: match._id
                })
                .get()
                .then(statsRes => {
                  const votes = statsRes.data;
                  return {
                    ...match,
                    votedTeam: voteMap.get(match._id) || null,
                    team1Votes: votes.filter(v => v.teamId === match.team1._id).length,
                    team2Votes: votes.filter(v => v.teamId === match.team2._id).length
                  };
                });
            });

            return Promise.all(matchPromises);
          })
          .then(processedMatches => {
            this.setData({
              matches: processedMatches,
              dateList: dateList,
              loading: false
            });

            // 使用保存的日期或查找与当前日期最近的日期
            if (currentSelectedDate && currentSelectedDate !== 'all') {
              this.selectDate({ currentTarget: { dataset: { date: currentSelectedDate } } });
            } else {
              // 查找最接近当前日期的日期
              const today = new Date();
              const todayStr = this.formatDate(today);
              
              // 如果有完全匹配今天的日期
              if (dateList.some(date => date.date === todayStr.replace(/\//g, '-'))) {
                this.selectDate({ currentTarget: { dataset: { date: todayStr.replace(/\//g, '-') } } });
              } else {
                // 找最接近的日期（优先找未来的日期）
                this.selectNearestDate(today, dateList);
              }
            }
          });
      })
      .catch(err => {
        console.error('加载比赛数据失败:', err);
        this.setData({ loading: false });
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  // 获取星期几
  getWeekday(date) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekdays[date.getDay()];
  },

  // 选择日期
  selectDate(e) {
    const selectedDate = e.currentTarget.dataset.date;
    let filteredMatches = [];

    // 更新当前日期ID，用于滚动定位
    const currentDateId = selectedDate === 'all' ? 'date-all' : `date-${selectedDate}`;
    this.setData({
      currentDateId: currentDateId
    });

    if (selectedDate === 'all') {
      filteredMatches = this.data.matches;
    } else {
      filteredMatches = this.data.matches.filter(match => {
        // 处理日期比较，兼容iOS
        const matchDateStr = match.date.split(' ')[0]; // 只取日期部分
        return matchDateStr === selectedDate;
      });
    }

    // 按时间排序 - 比赛内部还是保持降序，最新的在前面
    filteredMatches.sort((a, b) => {
      // 安全的日期比较
      try {
        // 将时间格式化为iOS兼容格式
        const dateA = a.date.replace(/-/g, '/');
        const dateB = b.date.replace(/-/g, '/');
        return new Date(dateB) - new Date(dateA); // 降序排列
      } catch(err) {
        console.error('日期排序错误:', err);
        return 0;
      }
    });

    this.setData({
      selectedDate: selectedDate,
      filteredMatches: filteredMatches
    });
  },

  // 格式化日期为兼容格式
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  // 格式化日期为yyyy-MM-dd形式
  formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  submitVote(e) {
    const matchId = e.currentTarget.dataset.matchId;
    const teamId = e.currentTarget.dataset.teamId;
    const userId = wx.getStorageSync('userId');

    if (!userId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const db = wx.cloud.database();
    
    wx.showLoading({
      title: '提交投票...',
      mask: true
    });

    // 检查是否已投票
    db.collection('votes')
      .where({
        matchId: matchId,
        userId: userId
      })
      .get()
      .then(res => {
        if (res.data.length > 0) {
          wx.hideLoading();
          wx.showToast({
            title: '您已经投过票了',
            icon: 'none'
          });
          return;
        }

        // 检查并确保用户信息存在于数据库
        return db.collection('users').where({
          userId: userId
        }).get().then(userRes => {
          if (userRes.data.length === 0) {
            // 如果用户不存在，先创建用户记录
            const nickname = wx.getStorageSync(`nickname_${userId}`) || `用户${userId.substring(userId.length - 4)}`;
            const avatarUrl = wx.getStorageSync(`avatar_${userId}`) || '';
            
            console.log('创建新用户记录:', userId);
            return db.collection('users').add({
              data: {
                userId: userId,
                nickname: nickname,
                avatarUrl: avatarUrl,
                createTime: db.serverDate()
              }
            }).then(() => {
              console.log('用户信息保存成功');
              // 继续添加投票
              return db.collection('votes').add({
                data: {
                  matchId: matchId,
                  userId: userId,
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
                matchId: matchId,
                userId: userId,
                teamId: teamId,
                createTime: db.serverDate()
              }
            });
          }
        });
      })
      .then(res => {
        if (res) {  // 只在实际添加投票后执行
          // 标记数据已更新
          const app = getApp();
          app.markDataUpdated('votes');

          // 重新加载数据以更新UI
          this.loadMatches();

          wx.hideLoading();
          wx.showToast({
            title: '投票成功',
            icon: 'success'
          });
        }
      })
      .catch(err => {
        console.error('投票失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: '投票失败，请重试',
          icon: 'none'
        });
      });
  }
});