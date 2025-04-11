// pages/match-manage/match-manage.js
// 确保Trace对象可用
if (typeof Trace === 'undefined' && typeof globalThis.Trace !== 'undefined') {
  const Trace = globalThis.Trace;
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    matches: [],
    filteredMatches: [],
    selectedDate: 'all',
    dateList: [],
    loading: true,
    error: null,
    currentDateId: 'date-all' // 当前日期ID，用于滚动到对应日期
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadMatches();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 检查是否需要刷新数据
    const app = getApp();
    if (app.globalData && app.checkDataUpdated && app.checkDataUpdated('matches')) {
      console.log('检测到比赛数据已更新，重新加载列表');
      this.loadMatches();
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadMatches(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载比赛数据
  loadMatches(callback) {
    this.setData({ loading: true, error: null });
    
    const db = wx.cloud.database();
    // 保存当前选择的日期
    const currentSelectedDate = this.data.selectedDate;
    
    db.collection('matches')
      .orderBy('date', 'desc')  // 按日期降序排列
      .get()
      .then(res => {
        const matches = res.data;
        // 处理日期列表
        const dateMap = new Map();
        
        matches.forEach(match => {
          // 确保日期格式一致
          const datePart = match.date.split(' ')[0]; // 只取日期部分
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

        this.setData({
          matches: matches,
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
      })
      .catch(err => {
        console.error('获取比赛列表失败:', err);
        this.setData({
          loading: false,
          error: '加载比赛数据失败，请重试'
        });
        
        if (callback) callback();
      });
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

  // 格式化日期为yyyy-MM-dd形式
  formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化日期为iOS兼容格式
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
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

    // 按时间排序
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

  // 添加新比赛
  addMatch() {
    wx.navigateTo({
      url: '/pages/match-edit/match-edit'
    });
  },

  // 编辑比赛
  editMatch(e) {
    const matchId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/match-edit/match-edit?id=${matchId}`
    });
  },

  // 删除比赛
  deleteMatch(e) {
    const matchId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这场比赛吗？删除后无法恢复。',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          this.doDeleteMatch(matchId);
        }
      }
    });
  },

  // 执行删除操作
  doDeleteMatch(matchId, forceDelete = false) {
    const db = wx.cloud.database();
    
    wx.showLoading({
      title: '删除中...',
      mask: true
    });
    
    // 1. 删除比赛记录
    const deleteMatchPromise = forceDelete ? 
      Promise.resolve() : // 如果是强制删除，跳过删除比赛步骤
      db.collection('matches').doc(matchId).remove()
        .then(() => {
          console.log('删除比赛成功');
        })
        .catch(err => {
          console.error('删除比赛失败:', err);
          
          // 如果不是强制删除，则抛出错误让下面的catch处理
          if (!forceDelete) {
            throw err;
          }
        });
    
    // 2. 无论比赛是否删除成功，都尝试删除相关的投票记录
    deleteMatchPromise
      .then(() => {
        return db.collection('votes').where({
          matchId: matchId
        }).remove();
      })
      .then(() => {
        console.log('删除相关投票成功');
        wx.hideLoading();
        
        // 通知应用数据已更新
        const app = getApp();
        app.markDataUpdated('matches');
        app.markDataUpdated('votes');
        
        // 如果是强制删除，直接从本地列表中移除该比赛
        if (forceDelete) {
          const updatedMatches = this.data.matches.filter(match => match._id !== matchId);
          const updatedFilteredMatches = this.data.filteredMatches.filter(match => match._id !== matchId);
          this.setData({
            matches: updatedMatches,
            filteredMatches: updatedFilteredMatches
          });
        } else {
          // 如果是常规删除，刷新整个列表
          this.loadMatches();
        }
        
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
      })
      .catch(err => {
        console.error('删除失败:', err);
        wx.hideLoading();
        
        // 如果删除失败，提示用户是否要强制删除
        wx.showModal({
          title: '删除失败',
          content: '无法删除此比赛记录，可能是因为权限问题或记录已不存在。是否要强制从列表中移除？',
          confirmText: '强制删除',
          confirmColor: '#ff0000',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              // 用户选择强制删除
              this.doDeleteMatch(matchId, true);
            }
          }
        });
      });
  },

  // 导航到投票页面
  goToVote(e) {
    const matchId = e.currentTarget.dataset.id;
    const app = getApp();
    app.goToVotePage(matchId);
  }
}) 