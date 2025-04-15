// pages/match-edit/match-edit.js
// 确保Trace对象可用
if (typeof Trace === 'undefined' && typeof globalThis.Trace !== 'undefined') {
  const Trace = globalThis.Trace;
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    matchId: null,
    isEditing: false,
    saving: false,
    statusOptions: ['未开始', '进行中', '已结束'],
    statusIndex: 0,
    matchData: {
      title: '',
      date: '',
      time: '',
      status: '未开始',
      team1: {
        _id: 'team1',
        name: '',
        description: ''
      },
      team2: {
        _id: 'team2',
        name: '',
        description: ''
      },
      result: {
        winner: '',
        score1: '',
        score2: '',
        description: ''
      }
    },
    titleSuggestions: [], // 标题建议列表
    showTitleSuggestions: false, // 是否显示标题建议
    inputValue: '', // 当前输入值
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 加载历史标题记录
    this.loadTitleHistory();
    
    if (options.id) {
      // 编辑现有比赛
      this.setData({
        matchId: options.id,
        isEditing: true
      });
      this.loadMatchData(options.id);
    } else {
      // 获取当前时间
      const now = new Date();
      
      // 创建安全的日期对象 - 使用iOS兼容格式
      const formattedDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const nextHourDate = new Date(formattedDate);
      nextHourDate.setHours(now.getHours() + 1);
      nextHourDate.setMinutes(0);
      nextHourDate.setSeconds(0);
      
      // 格式化日期
      const year = nextHourDate.getFullYear();
      const month = String(nextHourDate.getMonth() + 1).padStart(2, '0');
      const day = String(nextHourDate.getDate()).padStart(2, '0');
      const hours = String(nextHourDate.getHours()).padStart(2, '0');
      const minutes = '00';
      
      // 更新数据 - 使用横杠格式，因为表单需要
      this.setData({
        'matchData.date': `${year}-${month}-${day}`,
        'matchData.time': `${hours}:${minutes}`
      });
    }
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
    // 如果是编辑模式，确保返回时刷新列表页
    if (this.data.isEditing && this.data.matchId) {
      console.log('编辑页面被卸载，设置刷新标记');
      wx.setStorageSync('forceRefreshIndexPage', true);
    }
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

  // 加载比赛数据
  loadMatchData(matchId) {
    const db = wx.cloud.database();
    
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    db.collection('matches').doc(matchId).get()
      .then(res => {
        console.log('获取比赛数据成功:', res.data);
        const match = res.data;
        
        // 解析日期和时间
        let date = match.date;
        let time = '00:00';
        
        if (typeof match.date === 'string' && match.date.includes(' ')) {
          const parts = match.date.split(' ');
          date = parts[0];
          if (parts[1]) {
            time = parts[1].substring(0, 5); // 取时间的前5个字符 (HH:MM)
          }
        }
        
        // 设置状态索引
        let statusIndex = 0;
        if (match.status === '进行中') {
          statusIndex = 1;
        } else if (match.status === '已结束' || match.status === 'FINISHED') {
          statusIndex = 2;
        }
        
        // 确保result字段存在
        if (!match.result) {
          match.result = {
            winner: '',
            score1: '',
            score2: '',
            description: ''
          };
        }
        
        // 确保团队对象格式正确
        if (!match.team1) match.team1 = { _id: 'team1', name: '', description: '' };
        if (!match.team2) match.team2 = { _id: 'team2', name: '', description: '' };
        
        this.setData({
          matchData: {
            ...match,
            date: date,
            time: time
          },
          statusIndex: statusIndex
        });
        
        wx.hideLoading();
      })
      .catch(err => {
        console.error('获取比赛数据失败:', err);
        wx.hideLoading();
        
        wx.showToast({
          title: '加载失败，请重试',
          icon: 'none'
        });
      });
  },

  // 加载历史标题
  loadTitleHistory() {
    // 从存储中获取历史标题记录
    const titleHistory = wx.getStorageSync('matchTitleHistory') || [];
    this.setData({ 
      titleHistory: titleHistory
    });
  },

  // 标题输入框获得焦点
  onTitleFocus(e) {
    const value = this.data.matchData.title.trim();
    // 当有输入内容时，显示匹配的建议
    if (value) {
      this.updateTitleSuggestions(value);
    }
    // 否则显示所有历史记录
    else {
      const titleHistory = this.data.titleHistory || [];
      this.setData({
        titleSuggestions: titleHistory.slice(0, 5), // 限制显示5条
        showTitleSuggestions: titleHistory.length > 0
      });
    }
  },

  // 标题输入
  onTitleInput(e) {
    const value = e.detail.value.trim();
    this.setData({
      'matchData.title': value,
      inputValue: value
    });

    this.updateTitleSuggestions(value);
  },

  // 更新标题建议
  updateTitleSuggestions(value) {
    if (value) {
      // 从历史记录中过滤匹配当前输入的标题
      const titleHistory = this.data.titleHistory || [];
      const suggestions = titleHistory.filter(title => 
        title.toLowerCase().includes(value.toLowerCase())
      );

      this.setData({
        titleSuggestions: suggestions,
        showTitleSuggestions: suggestions.length > 0
      });
    } else {
      this.setData({
        showTitleSuggestions: false
      });
    }
  },

  // 选择标题建议
  selectTitleSuggestion(e) {
    const title = e.currentTarget.dataset.title;
    this.setData({
      'matchData.title': title,
      showTitleSuggestions: false
    });
  },

  // 保存标题到历史记录
  saveTitleToHistory(title) {
    if (!title.trim()) return;
    
    // 获取现有历史记录
    let titleHistory = wx.getStorageSync('matchTitleHistory') || [];
    
    // 如果标题已存在，先移除它（避免重复）
    titleHistory = titleHistory.filter(item => item !== title);
    
    // 将新标题添加到历史记录开头
    titleHistory.unshift(title);
    
    // 限制历史记录数量，最多保存20条
    if (titleHistory.length > 20) {
      titleHistory = titleHistory.slice(0, 20);
    }
    
    // 保存回存储
    wx.setStorageSync('matchTitleHistory', titleHistory);
    console.log('标题已保存到历史记录:', title);
  },

  // 日期选择
  onDateChange(e) {
    this.setData({
      'matchData.date': e.detail.value
    });
  },

  // 时间选择
  onTimeChange(e) {
    this.setData({
      'matchData.time': e.detail.value
    });
  },

  // 状态选择
  onStatusChange(e) {
    const statusIndex = parseInt(e.detail.value);
    const status = this.data.statusOptions[statusIndex];
    
    this.setData({
      statusIndex: statusIndex,
      'matchData.status': status
    });
  },

  // 队伍1名称输入
  onTeam1NameInput(e) {
    this.setData({
      'matchData.team1.name': e.detail.value
    });
  },

  // 队伍1描述输入
  onTeam1DescInput(e) {
    this.setData({
      'matchData.team1.description': e.detail.value
    });
  },

  // 队伍2名称输入
  onTeam2NameInput(e) {
    this.setData({
      'matchData.team2.name': e.detail.value
    });
  },

  // 队伍2描述输入
  onTeam2DescInput(e) {
    this.setData({
      'matchData.team2.description': e.detail.value
    });
  },

  // 比赛获胜方选择
  onWinnerChange(e) {
    this.setData({
      'matchData.result.winner': e.detail.value
    });
  },

  // 队伍1得分输入
  onScore1Input(e) {
    this.setData({
      'matchData.result.score1': e.detail.value
    });
  },

  // 队伍2得分输入
  onScore2Input(e) {
    this.setData({
      'matchData.result.score2': e.detail.value
    });
  },

  // 结果描述输入
  onResultDescInput(e) {
    this.setData({
      'matchData.result.description': e.detail.value
    });
  },

  // 取消操作
  onCancel() {
    wx.navigateBack();
  },

  // 保存数据
  onSave() {
    // 表单验证
    const validation = this.validateForm();
    if (!validation.valid) {
      wx.showToast({
        title: validation.message,
        icon: 'none'
      });
      return;
    }
    
    // 设置保存中状态
    this.setData({ saving: true });
    
    // 准备比赛数据
    const matchData = this.prepareMatchData();
    
    try {
      // 新建或更新比赛
      if (this.data.isEditing) {
        this.updateMatch(matchData)
          .catch(err => {
            this.setData({ saving: false });
            wx.showToast({
              title: '更新失败，请重试',
              icon: 'none'
            });
          });
      } else {
        this.createMatch(matchData)
          .catch(err => {
            this.setData({ saving: false });
            wx.showToast({
              title: '创建失败，请重试',
              icon: 'none'
            });
          });
      }
    } catch (err) {
      console.error('保存比赛失败:', err);
      this.setData({ saving: false });
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  },

  // 验证表单
  validateForm() {
    const { matchData } = this.data;
    
    if (!matchData.title.trim()) {
      return { valid: false, message: '请输入比赛标题' };
    }
    
    if (!matchData.date) {
      return { valid: false, message: '请选择比赛日期' };
    }
    
    if (!matchData.time) {
      return { valid: false, message: '请选择比赛时间' };
    }
    
    if (!matchData.team1.name.trim()) {
      return { valid: false, message: '请输入队伍1名称' };
    }
    
    if (!matchData.team2.name.trim()) {
      return { valid: false, message: '请输入队伍2名称' };
    }
    
    // 如果状态是已结束，验证结果
    if (matchData.status === '已结束' || matchData.status === 'FINISHED') {
      if (!matchData.result.winner) {
        return { valid: false, message: '请选择获胜方' };
      }
    }
    
    return { valid: true };
  },

  // 准备比赛数据用于保存
  prepareMatchData() {
    const { matchData } = this.data;
    
    // 合并日期和时间
    const dateTime = `${matchData.date} ${matchData.time}:00`;
    
    // 创建要保存的数据对象
    const data = {
      title: matchData.title,
      date: dateTime,
      status: matchData.status,
      team1: {
        _id: matchData.team1._id || 'team1',
        name: matchData.team1.name,
        description: matchData.team1.description || ''
      },
      team2: {
        _id: matchData.team2._id || 'team2',
        name: matchData.team2.name,
        description: matchData.team2.description || ''
      }
    };
    
    // 如果状态是已结束，添加结果数据
    if (matchData.status === '已结束' || matchData.status === 'FINISHED') {
      // 确保winner字段是队伍ID而不是整个队伍对象
      const winnerId = matchData.result.winner;
      
      data.result = {
        winner: winnerId,
        score1: matchData.result.score1 || '0',
        score2: matchData.result.score2 || '0',
        description: matchData.result.description || ''
      };
      
      console.log('保存的比赛结果:', data.result);
    }
    
    return data;
  },

  // 创建新比赛
  createMatch(matchData) {
    const db = wx.cloud.database();
    
    return db.collection('matches').add({
      data: matchData
    })
    .then(res => {
      console.log('创建比赛成功:', res._id);
      
      // 标记数据已更新，确保返回列表页时会刷新
      const app = getApp();
      app.markDataUpdated('matches');
      
      // 额外设置一个直接的刷新标记
      wx.setStorageSync('forceRefreshIndexPage', true);
      
      // 保存标题到历史记录
      this.saveTitleToHistory(matchData.title);
      
      wx.showToast({
        title: '创建成功',
        icon: 'success'
      });
      
      // 延迟返回，让用户看到成功提示
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    })
    .catch(err => {
      console.error('创建比赛失败:', err);
      throw err;
    });
  },

  // 更新现有比赛
  updateMatch(matchData) {
    const db = wx.cloud.database();
    const that = this;
    
    // 先尝试通过云函数更新，绕过权限限制
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    // 记录原始状态，用于检查是否正确更新
    const originalStatus = matchData.status;
    console.log('准备更新比赛，状态:', originalStatus);
    
    return wx.cloud.callFunction({
      name: 'updateMatch',
      data: {
        matchId: this.data.matchId,
        matchData: matchData
      }
    }).then(result => {
      console.log('通过云函数更新比赛:', result);
      
      wx.hideLoading();
      
      // 标记数据已更新
      const app = getApp();
      app.markDataUpdated('matches');
      wx.setStorageSync('forceRefreshIndexPage', true);
      
      // 保存标题到历史记录
      this.saveTitleToHistory(matchData.title);
      
      wx.showToast({
        title: '更新成功',
        icon: 'success'
      });
      
      // 延迟返回
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      
      return result;
    }).catch(err => {
      console.error('通过云函数更新比赛失败:', err);
      
      // 尝试直接更新数据库（此方法可能会因权限问题失败）
      return db.collection('matches').doc(this.data.matchId).update({
        data: matchData
      }).then(res => {
        console.log('直接更新比赛成功:', res);
        
        // 标记数据已更新
        const app = getApp();
        app.markDataUpdated('matches');
        wx.setStorageSync('forceRefreshIndexPage', true);
        
        // 保存标题到历史记录
        this.saveTitleToHistory(matchData.title);
        
        wx.hideLoading();
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });
        
        // 延迟返回
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        
        return res;
      }).catch(updateErr => {
        console.error('所有更新方法均失败:', updateErr);
        wx.hideLoading();
        wx.showToast({
          title: '更新失败，请重试',
          icon: 'none'
        });
        that.setData({ saving: false });
        throw updateErr;
      });
    });
  }
})