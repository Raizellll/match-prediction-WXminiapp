// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log('开始获取所有投票记录...', '传入参数:', event);
    const forceRefresh = event.forceRefresh || false;
    console.log('是否强制刷新:', forceRefresh);
    
    // 如果需要强制刷新，则不使用缓存
    // 获取本云环境ID，用于缓存键名称
    const { ENV } = cloud.DYNAMIC_CURRENT_ENV;
    const cacheKey = `votes_cache_${ENV || 'default'}`;
    
    // 尝试获取缓存数据
    if (!forceRefresh) {
      try {
        console.log('尝试获取缓存数据...');
        const cache = await cloud.database().collection('system_cache').doc(cacheKey).get();
        if (cache && cache.data && cache.data.votes && cache.data.updateTime) {
          // 检查缓存是否过期（5分钟内的数据视为有效）
          const now = new Date();
          const cacheTime = new Date(cache.data.updateTime);
          const diffMinutes = (now - cacheTime) / 1000 / 60;
          
          if (diffMinutes < 1) {
            console.log(`使用缓存数据，缓存时间: ${cacheTime}, 包含 ${cache.data.votes.length} 条记录`);
            return {
              success: true,
              votes: cache.data.votes,
              totalVotes: cache.data.votes.length,
              totalInDB: cache.data.totalInDB,
              fromCache: true,
              cacheTime: cache.data.updateTime,
              message: `成功从缓存获取到${cache.data.votes.length}条有效投票记录`
            };
          } else {
            console.log(`缓存已过期，已经过去 ${diffMinutes.toFixed(2)} 分钟`);
          }
        } else {
          console.log('未找到有效缓存或缓存结构不正确');
        }
      } catch (cacheError) {
        console.log('获取缓存失败，可能是首次运行:', cacheError.message);
      }
    } else {
      console.log('强制刷新，跳过缓存检查');
    }
    
    // 1. 获取投票总数
    const countResult = await db.collection('votes').count();
    const total = countResult.total;
    console.log('投票总数:', total);
    
    if (total === 0) {
      return {
        success: true,
        votes: [],
        message: '没有找到投票记录'
      };
    }
    
    // 2. 用游标方式获取所有数据
    console.log('使用游标方式获取所有投票记录');
    let allVotes = [];
    const MAX_LIMIT = 1000; // 增加每批次数量以提高效率
    const batchTimes = Math.ceil(total / MAX_LIMIT);
    
    console.log(`需要分${batchTimes}次获取所有数据`);
    
    // 采用并行请求的方式获取数据
    const tasks = [];
    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection('votes')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get();
      tasks.push(promise);
    }
    
    // 等待所有请求完成
    const results = await Promise.all(tasks);
    results.forEach((res, index) => {
      console.log(`第${index + 1}批获取到${res.data.length}条数据`);
      allVotes = allVotes.concat(res.data);
    });
    
    console.log(`总共获取到${allVotes.length}条投票记录，数据库记录总数${total}`);
    
    // 3. 过滤无效的投票记录
    const validVotes = allVotes.filter(vote => 
      vote && 
      vote.userId && 
      vote.matchId && 
      (vote.teamId || vote.team)
    );
    console.log(`其中有效投票记录${validVotes.length}条，无效记录${allVotes.length - validVotes.length}条`);
    
    if (validVotes.length < total) {
      console.warn(`警告：有效投票记录(${validVotes.length})少于数据库统计总数(${total})`);
    }
    
    // 更新缓存
    try {
      console.log('更新数据缓存...');
      const cacheData = {
        votes: validVotes,
        totalInDB: total,
        updateTime: db.serverDate()
      };
      
      // 尝试更新现有缓存
      await cloud.database().collection('system_cache')
        .doc(cacheKey)
        .set({
          data: cacheData
        })
        .then(() => {
          console.log('缓存更新成功');
        })
        .catch(error => {
          // 如果失败，可能是缓存不存在，尝试创建
          console.log('更新缓存失败，尝试创建新缓存:', error.message);
          return cloud.database().collection('system_cache').add({
            data: {
              _id: cacheKey,
              ...cacheData
            }
          });
        });
    } catch (cacheError) {
      console.error('缓存数据失败:', cacheError);
      // 缓存失败不影响主要功能
    }
    
    return {
      success: true,
      votes: validVotes,
      totalVotes: validVotes.length,
      totalInDB: total,
      fromCache: false,
      message: `成功获取到${validVotes.length}条有效投票记录`
    };
  } catch (error) {
    console.error('获取投票记录失败:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
} 