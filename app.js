// 設定
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzHzksJGFVs-23tNQDaP2HbqrODiqk3k0v3q120z78REcbxK8VgO4WXm_CFfCc33uyIgQ/exec'; // 用於寫入功能
const USE_FIREBASE = true; // 使用 Firebase 進行所有讀取操作
let liffInitialized = false;
let currentUser = null;
let userActivityStatus = {};
let initialPageSetupComplete = false; // 增加標誌防止重複跳轉

// 🚀 Firebase 一次性載入所有資料
async function waitForFirebase() {
    // 等待 Firebase SDK 載入完成
    while (!window.firebaseReady) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// Firebase 資料管理器
const FirebaseDataManager = {
    // 快取所有資料
    cache: {
        users: new Map(),
        activities: new Map(),
        products: new Map(),
        lotteryPrizes: new Map(),
        pointHistory: new Map(),
        lotteryHistory: new Map(),
        exchangedProducts: new Map(),
        leaderboard: []
    },
    
    // 一次性載入所有資料
    async loadAllData(userId) {
        try {
            await waitForFirebase();
            console.log('🚀 開始 Firebase 一次性載入所有資料...');
            const startTime = performance.now();
            
            const { db, collection, doc, getDoc, getDocs, query, orderBy, limit, where } = window.firebase;
            
            // 並行載入所有資料
            const [
                userDoc,
                activitiesSnapshot,
                productsSnapshot,
                prizesSnapshot,
                pointHistorySnapshot,
                lotteryHistorySnapshot,
                exchangedProductsSnapshot,
                allUsersSnapshot // 用於排行榜
            ] = await Promise.all([
                getDoc(doc(db, 'users', userId)),
                getDocs(collection(db, 'activities')),
                getDocs(collection(db, 'products')),
                getDocs(collection(db, 'lottery_prizes')),
                getDocs(query(collection(db, 'point_history'), where('userId', '==', userId), orderBy('timestamp', 'desc'), limit(50))),
                getDocs(query(collection(db, 'lottery_history'), where('userId', '==', userId), orderBy('timestamp', 'desc'), limit(50))),
                getDocs(query(collection(db, 'exchanged_products'), where('userId', '==', userId), orderBy('exchangeDate', 'desc'))),
                getDocs(query(collection(db, 'users'), orderBy('currentPoints', 'desc'), limit(20)))
            ]);
            
            const endTime = performance.now();
            console.log(`⚡ Firebase 資料載入完成: ${(endTime - startTime).toFixed(2)}ms`);
            
            // 處理用戶資料
            let userData = null;
            if (userDoc.exists()) {
                userData = userDoc.data();
                this.cache.users.set(userId, userData);
            }
            
            // 處理活動資料 - 添加欄位對應
            activitiesSnapshot.forEach(doc => {
                const data = doc.data();
                // 對應 Firebase 欄位到前端需要的欄位
                const activity = {
                    id: doc.id,
                    ...data,
                    // 欄位對應：確保前端需要的欄位存在
                    name: data.name || data.activityName || data.title,
                    description: data.description || data.activityDescription || '',
                    reward: data.reward || data.points || data.rewardPoints,
                    isActive: data.isActive !== false && data.status !== 'inactive' && data.status !== 'ended' && data.status !== '已結束',
                    status: data.isActive === false || data.status === 'ended' ? '已結束' : '進行中',
                    // 時間處理
                    startDate: data.startDate || data.startTime,
                    endDate: data.endDate || data.endTime
                };
                this.cache.activities.set(doc.id, activity);
            });
            
            // 處理商品資料 - 添加欄位對應
            productsSnapshot.forEach(doc => {
                const data = doc.data();
                // 對應 Firebase 欄位到前端需要的欄位
                const product = {
                    id: doc.id,
                    ...data,
                    // 欄位對應：確保前端需要的欄位存在
                    name: data.name || data.productName,
                    description: data.description || data.productDescription || '',
                    requiredPoints: data.requiredPoints || data.points || data.cost,
                    stock: data.stock || data.remainingQuantity || data.quantity,
                    isAvailable: data.isAvailable !== false,
                    status: data.status || 'available'
                };
                this.cache.products.set(doc.id, product);
            });
            
            // 處理抽獎獎品
            prizesSnapshot.forEach(doc => {
                this.cache.lotteryPrizes.set(doc.id, { id: doc.id, ...doc.data() });
            });
            
            // 處理歷史記錄
            const pointHistory = [];
            pointHistorySnapshot.forEach(doc => {
                pointHistory.push({ id: doc.id, ...doc.data() });
            });
            this.cache.pointHistory.set(userId, pointHistory);
            
            const lotteryHistory = [];
            lotteryHistorySnapshot.forEach(doc => {
                lotteryHistory.push({ id: doc.id, ...doc.data() });
            });
            this.cache.lotteryHistory.set(userId, lotteryHistory);
            
            // 處理已兌換商品
            const exchangedProducts = [];
            exchangedProductsSnapshot.forEach(doc => {
                exchangedProducts.push({ id: doc.id, ...doc.data() });
            });
            this.cache.exchangedProducts.set(userId, exchangedProducts);
            
            // 處理排行榜
            this.cache.leaderboard = [];
            allUsersSnapshot.forEach(doc => {
                const data = doc.data();
                this.cache.leaderboard.push({
                    userId: doc.id,
                    fbName: data.fbName || '匿名用戶',
                    currentPoints: data.currentPoints || 0,
                    memberLevel: data.memberLevel || '一般會員'
                });
            });
            
            console.log(`✅ Firebase 資料快取完成:`);
            console.log(`   用戶: ${userData ? '已載入' : '未找到'}`);
            console.log(`   活動: ${this.cache.activities.size} 筆`);
            console.log(`   商品: ${this.cache.products.size} 筆`);
            console.log(`   獎品: ${this.cache.lotteryPrizes.size} 筆`);
            console.log(`   已兌換商品: ${exchangedProducts.length} 筆`);
            console.log(`   排行榜: ${this.cache.leaderboard.length} 筆`);
            
            return {
                success: true,
                userData,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('❌ Firebase 載入失敗:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // 獲取快取的用戶資料
    getUserData(userId) {
        return this.cache.users.get(userId);
    },
    
    // 獲取快取的活動資料
    getActivities() {
        const allActivities = Array.from(this.cache.activities.values());
        console.log('🔍 所有活動資料:', allActivities);
        
        const filteredActivities = allActivities.filter(activity => 
            activity.isActive !== false && activity.status !== 'inactive' && activity.status !== 'ended' && activity.status !== '已結束'
        );
        
        console.log('🔍 過濾後活動資料:', filteredActivities);
        
        // 如果過濾後沒有結果，返回所有活動（開發模式）
        const result = filteredActivities.length > 0 ? filteredActivities : allActivities;
        console.log('🔍 最終返回活動資料:', result);
        return result;
    },
    
    // 獲取快取的商品資料
    getProducts() {
        const allProducts = Array.from(this.cache.products.values());
        const filteredProducts = allProducts.filter(product => 
            product.isAvailable !== false && product.status !== 'unavailable' && (product.remainingQuantity === undefined || product.remainingQuantity > 0)
        );
        
        // 如果過濾後沒有結果，返回所有商品（開發模式）
        return filteredProducts.length > 0 ? filteredProducts : allProducts;
    },
    
    // 獲取快取的抽獎獎品
    getLotteryPrizes() {
        const allPrizes = Array.from(this.cache.lotteryPrizes.values());
        const filteredPrizes = allPrizes.filter(prize => 
            prize.isAvailable !== false && prize.status !== 'unavailable'
        );
        
        // 如果過濾後沒有結果，返回所有獎品（開發模式）
        return filteredPrizes.length > 0 ? filteredPrizes : allPrizes;
    },
    
    // 獲取快取的點數歷史
    getPointHistory(userId) {
        return this.cache.pointHistory.get(userId) || [];
    },
    
    // 獲取快取的抽獎歷史
    getLotteryHistory(userId) {
        return this.cache.lotteryHistory.get(userId) || [];
    },
    
    // 獲取快取的排行榜
    getLeaderboard() {
        return this.cache.leaderboard;
    },
    
    // 獲取快取的已兌換商品
    getExchangedProducts(userId) {
        return this.cache.exchangedProducts.get(userId) || [];
    }
};

// 頁面歷史記錄
let pageHistory = ['mainPage'];
let currentPageId = 'mainPage'; // 追蹤當前頁面

// 進度條管理器
const ProgressManager = {
    overlay: null,
    progressBar: null,
    progressText: null,
    progressPercentage: null,
    currentProgress: 0,
    
    init() {
        this.overlay = document.getElementById('loadingOverlay');
        this.progressBar = document.getElementById('loadingProgressBar');
        this.progressText = document.getElementById('loadingProgressText');
        this.progressPercentage = document.getElementById('loadingPercentage');
    },
    
    show() {
        if (this.overlay) {
            this.overlay.style.display = 'block';
            this.overlay.classList.remove('fade-out');
        }
    },
    
    hide() {
        if (this.overlay) {
            this.overlay.classList.add('fade-out');
            setTimeout(() => {
                if (this.overlay) {
                    this.overlay.style.display = 'none';
                }
            }, 500); // 等待過渡動畫完成
        }
    },
    
    setProgress(percent, text = null) {
        this.currentProgress = Math.min(100, Math.max(0, percent));
        const roundedPercent = Math.round(this.currentProgress);
        
        // 更新進度條寬度
        if (this.progressBar) {
            this.progressBar.style.width = `${this.currentProgress}%`;
        }
        
        // 更新大百分比顯示
        if (this.progressPercentage) {
            this.progressPercentage.textContent = `${roundedPercent}%`;
        }
        
        // 更新文字說明
        if (this.progressText) {
            this.progressText.textContent = text || '載入中...';
        }
    },
    
    // 快速跳到85-98%的隨機位置
    quickProgress() {
        return new Promise(resolve => {
            // 第一階段：快速到 85-89%
            const firstProgress = Math.floor(Math.random() * 5) + 85; // 85-89% 之間的隨機數
            this.setProgress(firstProgress);

            // 第二階段：1秒後到 92-98%，確保比第一階段高
            setTimeout(() => {
                const secondProgress = Math.floor(Math.random() * 7) + 92; // 92-98% 之間的隨機數   
                this.setProgress(secondProgress);

                // 最後階段：等待完成時到 100%
                // complete() 方法會被外部調用，將進度更新到 100%
            }, 1000);

            resolve();
        });
    },
    
    // 完成進度條
    complete() {
        this.setProgress(100, '載入完成！');
        setTimeout(() => {
            this.hide();
        }, 1000); // 延長顯示時間到1秒，讓使用者能看到100%的狀態
    }
};

// API管理器 - 統一管理所有API調用，避免重複請求
const APIManager = {
    // 正在進行的請求快取
    pendingRequests: new Map(),
    
    // 統一的請求方法
    async request(action, params = {}, options = {}) {
        const { 
            method = 'GET', 
            skipCache = false,
            cacheKey = null 
        } = options;
        
        // 構建請求鍵值
        const requestKey = cacheKey || `${action}_${JSON.stringify(params)}`;
        
        // 如果相同請求正在進行中，直接返回該Promise
        if (!skipCache && this.pendingRequests.has(requestKey)) {
            console.log(`⚡ 複用進行中的API請求: ${action}`);
            return this.pendingRequests.get(requestKey);
        }
        
        // 構建請求
        const accessToken = liff.getAccessToken();
        const userId = currentUser?.userId;
        
        let requestPromise;
        
        if (method === 'GET') {
            const urlParams = new URLSearchParams({
                action,
                accessToken,
                ...params
            });
            if (userId) urlParams.set('userId', userId);
            
            requestPromise = fetch(`${API_BASE_URL}?${urlParams.toString()}`);
        } else {
            const bodyParams = new URLSearchParams({
                action,
                accessToken,
                ...params
            });
            if (userId) bodyParams.set('userId', userId);
            
            requestPromise = fetch(API_BASE_URL, {
                method,
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: bodyParams.toString()
            });
        }
        
        // 將請求轉換為JSON並處理結果，集成性能監控
        const timer = PerformanceManager.startTimer(`API_${action}`);
        const finalPromise = requestPromise
            .then(response => response.json())
            .finally(() => {
                // 記錄性能數據
                timer.end();
                // 請求完成後移除快取
                this.pendingRequests.delete(requestKey);
            });
        
        // 快取正在進行的請求
        if (!skipCache) {
            this.pendingRequests.set(requestKey, finalPromise);
        }
        
        return finalPromise;
    },
    
    // 批量請求方法
    async batchRequest(requests, priorityMap = {}) {
        // priorityMap: { action: 'high' | 'low' }
        const high = [], low = [];
        for (const req of requests) {
            if (priorityMap[req.action] === 'low') low.push(req);
            else high.push(req);
        }
        // 先執行高優先級
        const highResults = await Promise.all(high.map(req => this.request(req.action, req.params, req.options)));
        // 低優先級用 allSettled，不阻塞主流程
        const lowResultsPromise = low.length ? Promise.allSettled(low.map(req => this.request(req.action, req.params, req.options))) : Promise.resolve([]);
        return highResults.concat(await lowResultsPromise);
    },
    
    // 常用API的快捷方法
    getUserPoints: () => APIManager.request('getUserPoints'),
    getLotteryTickets: () => APIManager.request('getLotteryTickets'),
    getExchangedProducts: () => APIManager.request('getExchangedProducts', {}, { method: 'POST' }),
    getActivities: () => APIManager.request('getActivities'),
    getUserActivityStatus: () => APIManager.request('getUserActivityStatus'),
    getPointHistory: () => APIManager.request('getPointHistory'),
    getLotteryHistory: () => APIManager.request('getLotteryHistory'),
    getLotteryPrizes: () => APIManager.request('getLotteryPrizes'),
    getProducts: () => APIManager.request('getProducts'),
    getLeaderboard: () => APIManager.request('getLeaderboard'),
    
    // 清除所有進行中的請求
    clearPendingRequests: () => {
        APIManager.pendingRequests.clear();
    }
};

// 顯示優化管理器 - 避免重複的DOM操作和渲染
const DisplayManager = {
    // 渲染隊列
    renderQueue: new Map(),
    
    // 防抖渲染
    scheduleRender(pageId, data, renderFunction) {
        // 清除之前的渲染計劃
        if (this.renderQueue.has(pageId)) {
            clearTimeout(this.renderQueue.get(pageId));
        }
        
        // 延遲渲染，避免快速連續更新
        const timeoutId = setTimeout(() => {
            renderFunction(data);
            this.renderQueue.delete(pageId);
        }, 50); // 50ms防抖
        
        this.renderQueue.set(pageId, timeoutId);
    },
    
    // 立即渲染（跳過防抖）
    immediateRender(pageId, data, renderFunction) {
        // 清除防抖渲染
        if (this.renderQueue.has(pageId)) {
            clearTimeout(this.renderQueue.get(pageId));
            this.renderQueue.delete(pageId);
        }
        
        renderFunction(data);
    },
    
    // 智能渲染 - 只在當前頁面時立即渲染，否則延遲
    smartRender(pageId, data, renderFunction) {
        if (currentPageId === pageId) {
            this.immediateRender(pageId, data, renderFunction);
        } else {
            this.scheduleRender(pageId, data, renderFunction);
        }
    }
};

// 智能背景更新管理器
const SmartBackgroundUpdate = {
    // 啟動背景更新服務
    start() {
        // 每45秒更新數量相關資訊
        setInterval(() => {
            this.updateQuantityData();
        }, 45000);

        // 每5分鐘更新靜態資料
        setInterval(() => {
            this.updateStaticData();
        }, 300000);
    },

    // 更新數量相關資訊
    async updateQuantityData() {
        try {
            const [productsRes, prizesRes, exchangedRes] = await Promise.all([
                APIManager.getProducts(),
                APIManager.getLotteryPrizes(),
                APIManager.getExchangedProducts()
            ]);

            // 更新商品數量
            if(productsRes.success) {
                SmartCacheManager.smartSet('productQuantity', productsRes.data, 'critical');
                // 如果在商品頁面，更新顯示
                if(currentPageId === 'productsPage') {
                    const productsData = SmartCacheManager.smartGet('products', 'static');
                    if(productsData) {
                        const mergedProducts = productsData.map(product => {
                            const quantity = productsRes.data.find(q => q.id === product.id);
                            return {
                                ...product,
                                remainingQuantity: quantity?.remainingQuantity ?? product.remainingQuantity
                            };
                        });
                        displayProducts(mergedProducts);
                    }
                }
            }

            // 更新獎品數量
            if(prizesRes.success) {
                SmartCacheManager.smartSet('lotteryQuantity', prizesRes.data.map(prize => ({
                    id: prize.id,
                    remainingQuantity: prize.remainingQuantity
                })), 'critical');
                // 如果在抽獎頁面，更新顯示
                if(currentPageId === 'lotteryPage') {
                    const prizesData = SmartCacheManager.smartGet('lotteryPrizes', 'static');
                    if(prizesData) {
                        const mergedPrizes = prizesData.map(prize => {
                            const quantity = prizesRes.data.find(q => q.id === prize.id);
                            return {
                                ...prize,
                                remainingQuantity: quantity?.remainingQuantity ?? prize.remainingQuantity
                            };
                        });
                        displayLotteryPrizes(mergedPrizes);
                    }
                }
            }

            // 更新已兌換商品數量
            if(exchangedRes.success) {
                cache.set('exchangedResult', exchangedRes, 300000);
                const now = new Date();
                const unusedCount = exchangedRes.data.filter(product => {
                    const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                    return product.status === '未使用' && !isExpired;
                }).length;
                UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, 'background-update');
                // 如果在已兌換頁面，更新顯示
                if(currentPageId === 'exchangedPage') {
                    displayExchangedProducts(exchangedRes.data);
                }
            }
        } catch (error) {
            console.error('背景更新數量資料失敗:', error);
        }
    },

    // 更新靜態資料
    async updateStaticData() {
        try {
            const [productsRes, prizesRes] = await Promise.all([
                APIManager.getProducts(),
                APIManager.getLotteryPrizes()
            ]);

            // 更新商品基本資料
            if(productsRes.success) {
                SmartCacheManager.smartSet('products', productsRes.data, 'static');
            }

            // 更新獎品基本資料
            if(prizesRes.success) {
                SmartCacheManager.smartSet('lotteryPrizes', prizesRes.data, 'static');
            }
        } catch (error) {
            console.error('背景更新靜態資料失敗:', error);
        }
    }
};

// 智能快取優化管理器 - 分層快取策略
const SmartCacheManager = {
    // 快取策略配置
    strategies: {
        critical: { 
            ttl: 30000,        // 30秒 - 只針對數量相關
            maxAge: 120000     // 2分鐘
        },
        realtime: { 
            ttl: 120000,       // 2分鐘
            maxAge: 600000     // 10分鐘
        },
        semi_static: { 
            ttl: 3600000,      // 1小時
            maxAge: 7200000    // 2小時
        },
        static: { 
            ttl: 86400000,     // 24小時
            maxAge: 604800000  // 7天
        }
    },
    
    // 數據類型映射到快取策略
    dataTypeMap: {
        // 即時數據 - 只有數量相關
        'productQuantity': 'critical',     
        'lotteryQuantity': 'critical',     
        'userPoints': 'critical',          
        'lotteryTickets': 'critical',      
        'unusedProductsCount': 'critical', 
        
        // 商品資料改為半靜態
        'products': 'semi_static',         // 商品基本資料
        'lotteryPrizes': 'semi_static',    // 獎項基本資料
        
        // 其他資料改為靜態
        'activities': 'static',            // 活動列表
        'leaderboard': 'static',           // 排行榜
        'pointHistory': 'static',          // 點數歷史
        'lotteryHistory': 'static',        // 抽獎歷史
    },
    
    // 根據數據類型獲取快取策略
    getStrategy(dataType) {
        const strategies = {
            'userPoints': 'critical',       // 用戶點數
            'lotteryTickets': 'critical',   // 抽獎券
            'exchangedResult': 'critical',  // 兌換記錄
            'pointsResult': 'userPoints',   // 點數結果
            'pointHistory': 'static',       // 點數歷史
            'leaderboard': 'static',        // 排行榜
            'lotteryHistory': 'static',     // 抽獎歷史
            'activities': 'static',         // 活動列表
            'products': 'static',           // 商品列表
            'lotteryPrizes': 'static'       // 抽獎獎品
        };
        
        return strategies[dataType] || 'default';
    },
    
    // 智能設置快取
    smartSet(key, value, dataType = 'default') {
        const strategy = this.getStrategy(dataType);
        cache.set(key, value, strategy.ttl);
        
        // 記錄快取設置日志
        
        PerformanceManager.recordCacheMiss(); // 設置新快取表示之前未命中
    },
    
    // 檢查是否需要強制更新（針對即時數據）
    shouldForceUpdate(dataType) {
        const strategy = this.getStrategy(dataType);
        return strategy.priority === 'accuracy';
    },
    
    // 智能獲取快取
    smartGet(key, dataType = 'default') {
        const cachedData = cache.get(key);
        if (cachedData) {
            PerformanceManager.recordCacheHit();
            return cachedData;
        }
        
        // 對於即時數據，嘗試獲取稍舊的快取
        if (this.shouldForceUpdate(dataType)) {
            const staleData = cache.getStale(key);
            if (staleData && cache.getAge(key) < 300000) { // 5分鐘內的舊快取還能用
                console.log(`⚡ 使用稍舊的${dataType}快取:`, key);
                PerformanceManager.recordCacheHit();
                return staleData;
            }
        }
        
        PerformanceManager.recordCacheMiss();
        return null;
    },
    
    // 檢查是否需要更新
    shouldUpdate(key, dataType = 'default') {
        const strategy = this.getStrategy(dataType);
        return cache.needsUpdate(key, strategy.maxAge);
    }
};

// 防重複請求管理器 - 防止快速重複點擊造成的問題
const RequestLockManager = {
    locks: new Set(),
    
    // 檢查是否已鎖定
    isLocked(key) {
        return this.locks.has(key);
    },
    
    // 鎖定請求
    lock(key) {
        this.locks.add(key);
        console.log(`🔒 鎖定請求: ${key}`);
    },
    
    // 解鎖請求
    unlock(key) {
        this.locks.delete(key);
        console.log(`🔓 解鎖請求: ${key}`);
    },
    
    // 清除所有鎖定
    clear() {
        this.locks.clear();
        console.log('🔄 清除所有請求鎖定');
    },
    
    // 獲取當前鎖定的請求列表（除錯用）
    getLockedRequests() {
        return Array.from(this.locks);
    }
};

// 簡化版性能監控管理器
const PerformanceManager = {
    startTimer(operation) {
        const startTime = performance.now();
        return {
            end: () => {
                return performance.now() - startTime;
            }
        };
    },
    recordCacheHit() {},
    recordCacheMiss() {}
};

// 批量請求優化管理器
const BatchRequestManager = {
    // 請求隊列
    requestQueue: new Map(),
    
    // 批次配置
    batchConfig: {
        maxBatchSize: 5,        // 最大批次大小
        waitTime: 100,          // 等待時間(ms)
        highPriorityActions: ['getUserPoints', 'getLotteryTickets', 'getProducts', 'getLotteryPrizes']
    },
    
    // 添加請求到隊列
    addRequest(action, params = {}, options = {}) {
        const requestId = `${action}_${Date.now()}_${Math.random()}`;
        const request = {
            id: requestId,
            action,
            params,
            options,
            timestamp: Date.now(),
            priority: this.batchConfig.highPriorityActions.includes(action) ? 'high' : 'normal'
        };
        
        return new Promise((resolve, reject) => {
            request.resolve = resolve;
            request.reject = reject;
            this.requestQueue.set(requestId, request);
            this.scheduleExecution();
        });
    },
    
    // 調度執行
    scheduleExecution() {
        if (this.executionTimer) return;
        
        this.executionTimer = setTimeout(() => {
            this.executeBatch();
            this.executionTimer = null;
        }, this.batchConfig.waitTime);
    },
    
    // 執行批次請求
    async executeBatch() {
        const requests = Array.from(this.requestQueue.values());
        if (requests.length === 0) return;
        
        // 按優先級排序
        requests.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            return a.timestamp - b.timestamp;
        });
        
        // 分批執行
        const batches = [];
        for (let i = 0; i < requests.length; i += this.batchConfig.maxBatchSize) {
            batches.push(requests.slice(i, i + this.batchConfig.maxBatchSize));
        }
        
        console.log(`🚀 執行 ${batches.length} 個批次，共 ${requests.length} 個請求`);
        
        for (const batch of batches) {
            await this.processBatch(batch);
        }
        
        // 清空隊列
        this.requestQueue.clear();
    },
    
    // 處理單個批次
    async processBatch(batch) {
        const promises = batch.map(async (request) => {
            try {
                const result = await APIManager.request(request.action, request.params, {
                    ...request.options,
                    skipCache: true // 批次請求跳過重複檢查
                });
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            }
        });
        
        await Promise.allSettled(promises);
    }
};

// 預載管理器 - 智能預載數據
const PreloadManager = {
    // 預載策略
    preloadStrategies: {
        'mainPage': ['userPoints', 'lotteryTickets', 'unusedProductsCount'],
        'earnPage': ['activities', 'userActivityStatus'],
        'productsPage': ['products'],
        'exchangedPage': ['exchangedProducts'],
        'lotteryPage': ['lotteryPrizes', 'lotteryTickets'],
        'recordsPage': ['pointHistory', 'lotteryHistory'],
        'leaderboardPage': ['leaderboard']
    },
    
    // 當前預載任務
    currentTasks: new Set(),
    
    // 預載頁面數據
    async preloadForPage(pageId) {
        const strategy = this.preloadStrategies[pageId];
        if (!strategy) return;
        
        
        
        const preloadTasks = strategy.filter(dataType => {
            // 檢查是否已有快取且未過期
            const cacheKey = this.getDataTypeCacheKey(dataType);
            const cached = SmartCacheManager.smartGet(cacheKey, dataType);
            return !cached; // 只預載沒有快取的數據
        });
        
 
        
        // 並發預載
        const preloadPromises = preloadTasks.map(dataType => 
            this.preloadDataType(dataType)
        );
        
        await Promise.allSettled(preloadPromises);
        
        // 如果是earnPage，確保activities和userActivityStatus都已載入後才顯示
        if (pageId === 'earnPage') {
            const activities = SmartCacheManager.smartGet('activities', 'static');
            const status = SmartCacheManager.smartGet('userActivityStatus', 'realtime');
            
            if (activities && status) {
                userActivityStatus = status; // 設置全局變數
                const earnActivitiesList = document.getElementById('earnActivitiesList');
                if (earnActivitiesList) {
                    displayActivities(activities);
                }
            }
        }
   
    },
    
    // 預載特定類型數據
    async preloadDataType(dataType) {
        if (this.currentTasks.has(dataType)) {
            console.log(`⏳ ${dataType} 正在預載中，跳過`);
            return;
        }
        
        this.currentTasks.add(dataType);
        
        try {
            const action = this.getActionForDataType(dataType);
            if (!action) return;
            
            const result = await APIManager.request(action);
            
            if (result && result.success) {
                const cacheKey = this.getDataTypeCacheKey(dataType);
                const cacheStrategy = SmartCacheManager.dataTypeMap[dataType] || 'realtime';
                SmartCacheManager.smartSet(cacheKey, result.data || result, cacheStrategy);
                
                // 如果是活動狀態，更新全局變數
                if (dataType === 'userActivityStatus') {
                    userActivityStatus = result.data;
                }
                
                console.log(`✅ 預載 ${dataType} 成功`);
            }
        } catch (error) {
            console.error(`❌ 預載 ${dataType} 失敗:`, error);
        } finally {
            this.currentTasks.delete(dataType);
        }
    },
    
    // 獲取數據類型對應的API動作
    getActionForDataType(dataType) {
        const actionMap = {
            'userPoints': 'getUserPoints',
            'lotteryTickets': 'getLotteryTickets',
            'unusedProductsCount': 'getExchangedProducts',
            'activities': 'getActivities',
            'userActivityStatus': 'getUserActivityStatus',
            'products': 'getProducts',
            'exchangedProducts': 'getExchangedProducts',
            'lotteryPrizes': 'getLotteryPrizes',
            'pointHistory': 'getPointHistory',
            'lotteryHistory': 'getLotteryHistory',
            'leaderboard': 'getLeaderboard'
        };
        return actionMap[dataType];
    },
    
    // 獲取數據類型對應的快取鍵
    getDataTypeCacheKey(dataType) {
        const keyMap = {
            'userPoints': 'pointsResult',
            'lotteryTickets': 'lotteryTickets',
            'unusedProductsCount': 'exchangedResult',
            'activities': 'activities',
            'userActivityStatus': 'userActivityStatus',
            'products': 'products',
            'exchangedProducts': 'exchangedResult',
            'lotteryPrizes': 'lotteryPrizes',
            'pointHistory': 'pointHistory',
            'lotteryHistory': 'lotteryHistory',
            'leaderboard': 'leaderboard'
        };
        return keyMap[dataType] || dataType;
    }
};

// 背景更新管理器
const BackgroundUpdateManager = {
    // 更新間隔配置(ms)
    updateIntervals: {
        'critical': 45000,      // 45秒更新即時數據
        'realtime': 180000,     // 3分鐘更新準即時數據
        'semi_static': 1800000, // 30分鐘更新半靜態數據
        'static': 3600000       // 1小時更新靜態數據
    },
    
    // 活動定時器
    timers: new Map(),
    
    // 開始背景更新
    startBackgroundUpdates() {
        console.log('🔄 啟動背景更新服務');
        
        // 為每個策略設置定時器
        Object.entries(this.updateIntervals).forEach(([strategy, interval]) => {
            const timer = setInterval(() => {
                this.updateDataByStrategy(strategy);
            }, interval);
            
            this.timers.set(strategy, timer);
            console.log(`⏰ 設置 ${strategy} 背景更新，間隔: ${interval/1000}秒`);
        });
    },
    
    // 停止背景更新
    stopBackgroundUpdates() {
        this.timers.forEach(timer => clearInterval(timer));
        this.timers.clear();
        console.log('⏹️ 停止背景更新服務');
    },
    
    // 按策略更新數據
    async updateDataByStrategy(strategy) {
        const dataTypes = Object.entries(SmartCacheManager.dataTypeMap)
            .filter(([_, strategyKey]) => strategyKey === strategy)
            .map(([dataType, _]) => dataType);
        
        if (dataTypes.length === 0) return;
        
        console.log(`🔄 背景更新 ${strategy} 數據:`, dataTypes);
        
        // 使用批量請求更新
        const updateTasks = dataTypes.map(dataType => 
            PreloadManager.preloadDataType(dataType)
        );
        
        await Promise.allSettled(updateTasks);
    }
};

// 啟動智能背景更新服務 - 已移動到載入成功後立即啟動
// 避免重複啟動背景服務

// ========== 到期日期系統 ==========

// 更新到期日期顯示
function updateExpiryInfo() {
    // 獲取點數和抽獎券的資訊圖標
    const pointsInfoIcon = document.querySelector('.points-info-icon[data-type="points"] .points-info-tooltip');
    const ticketsInfoIcon = document.querySelector('.points-info-icon[data-type="tickets"] .points-info-tooltip');
    
    // 從API獲取到期日期（這裡暫時使用固定日期，實際應該從API獲取）
    const pointsExpiryDate = '2025/12/31';
    const ticketsExpiryDate = '2025/12/31';
    
    // 更新tooltip內容
    if (pointsInfoIcon) {
        pointsInfoIcon.textContent = `本期點數將於 ${pointsExpiryDate} 到期`;
    }
    if (ticketsInfoIcon) {
        ticketsInfoIcon.textContent = `本期抽獎券將於 ${ticketsExpiryDate} 到期`;
    }
}

// 顯示/隱藏 tooltip
function toggleTooltip(element) {
    // 先隱藏所有其他的 tooltip
    document.querySelectorAll('.points-info-tooltip.show').forEach(tooltip => {
        if (tooltip !== element.querySelector('.points-info-tooltip')) {
            tooltip.classList.remove('show');
        }
    });
    
    const tooltip = element.querySelector('.points-info-tooltip');
    tooltip.classList.add('show');
    
    // 3秒後自動隱藏
    setTimeout(() => {
        tooltip.classList.remove('show');
    }, 3000);
}

// 根據會員等級取得對應的樣式
function getMemberLevelStyle(level) {
    switch(level) {
        case '鑽石會員':
            return {
                levelName: level,
                className: 'diamond'
            };
        case '白金會員':
            return {
                levelName: level,
                className: 'platinum'
            };
        case '黃金會員':
            return {
                levelName: level,
                className: 'gold'
            };
        default:
            return {
                levelName: level || '一般會員',
                className: 'normal'
            };
    }
}

// 在載入用戶資料後更新到期日期
async function loadUserProfileOptimized() {
    try {
        const profile = await liff.getProfile();
        currentUser = profile;
        
        // 更新用戶頭像
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar) {
            userAvatar.style.backgroundImage = `url(${profile.pictureUrl})`;
            userAvatar.style.backgroundSize = 'cover';
            userAvatar.textContent = '';
        }
        
        // 更新用戶名稱
        const userName = document.getElementById('userName');
        if (userName) {
            userName.textContent = profile.displayName;
        }
        
        // 更新到期日期顯示
        updateExpiryInfo();
        
        // 檢查綁定狀態和會員等級
        const bindingResult = await APIManager.request('checkBinding');
        if (bindingResult.success && bindingResult.isBound) {
            // 更新電話顯示
            const phoneField = bindingResult.userData?.customerInputPhone || '';
            let displayPhone = '未設定電話';
            
            if (phoneField) {
                let phoneStr = String(phoneField).trim();
                if (phoneStr.length === 9 && /^\d{9}$/.test(phoneStr)) {
                    displayPhone = '0' + phoneStr;
                } else if (phoneStr.length === 10 && phoneStr.startsWith('0') && /^\d{10}$/.test(phoneStr)) {
                    displayPhone = phoneStr;
                } else if (phoneStr) {
                    displayPhone = phoneStr;
                }
            }
            document.getElementById('userPhone').textContent = displayPhone;
            
            // 更新會員等級顯示
            const memberLevel = bindingResult.userData?.memberLevel || '一般會員';
            const levelStyle = getMemberLevelStyle(memberLevel);
            const accountStatusElement = document.getElementById('accountStatus');
            if (accountStatusElement) {
                accountStatusElement.textContent = levelStyle.levelName;
                accountStatusElement.className = `account-status-large ${levelStyle.className}`;
            }
        } else {
            document.getElementById('userPhone').textContent = '未綁定';
            document.getElementById('accountStatus').textContent = '一般會員';
            document.getElementById('accountStatus').className = 'account-status-large normal';
        }
        
        return profile;
    } catch (error) {
        console.error('載入用戶資料時發生錯誤:', error);
        throw error;
    }
}

// ========== 性能優化配置總結 ==========



// 🔥 統一用戶資料管理器 - 解決所有同步問題
// ================== 靜態頁面設定 ==================
// 📌 靜態頁面清單：recordsPage（點數異動、抽獎記錄）, leaderboardPage（排行榜）
// 📌 靜態頁面特性：
//    1. 只在首次進入LIFF時背景更新
//    2. 任何其他操作（領取點數、抽獎、商品兌換）都不會觸發自動更新
//    3. 只能透過手動點擊更新按鈕才會更新
//    4. 進入頁面時只顯示快取資料和更新時間
// ==================================================
const UserDataManager = {
    // 權威數據存儲
    authoritative: {
        points: null,
        lotteryTickets: null,
        unusedProductsCount: null,
        lastUpdate: null
    },
    
    // 頁面數據快取
    pageData: {
        exchangedProducts: null,
        activities: null,
        userActivityStatus: null,
        pointHistory: null,
        lotteryHistory: null,
        lotteryPrizes: null,
        products: null,
        leaderboard: null
    },
    
    // 頁面更新標記
    pageUpdateFlags: {
        exchangedPage: false,
        earnPage: false,
        recordsPage: false,
        lotteryPage: false,
        productsPage: false,
        leaderboardPage: false
    },
    
    // 設置權威數據（來自API的最新數據）
    setAuthoritative(type, value, source = 'API') {
        const timestamp = Date.now();
        this.authoritative[type] = value;
        this.authoritative.lastUpdate = timestamp;
        
        //console.log(`🔒 設置權威${type}: ${value} (來源: ${source})`);
        
        // 立即更新UI顯示
        this.updateUI(type, value);
        
        // 設置2分鐘的保護期，防止被覆蓋
        setTimeout(() => {
            if (this.authoritative.lastUpdate === timestamp) {
                //console.log(`⏰ 權威${type}保護期結束`);
                this.authoritative[type] = null;
            }
        }, 120000); // 2分鐘
    },
    
    // 更新UI顯示
    updateUI(type, value) {
        switch(type) {
            case 'points':
                const pointsElement = document.getElementById('headerPoints');
                if (pointsElement) {
                    // 🔧 確保點數是數字，處理可能的物件輸入
                    let pointsValue = 0;
                    
                    if (typeof value === 'number') {
                        pointsValue = value;
                    } else if (typeof value === 'object' && value !== null) {
                        // 如果是物件，嘗試提取 currentPoints 或 points 屬性
                        pointsValue = value.currentPoints || value.points || 0;
                    } else if (typeof value === 'string') {
                        pointsValue = parseInt(value) || 0;
                    }
                    
                    pointsElement.textContent = Number(pointsValue).toLocaleString();
                    //console.log(`📊 UI更新 - 點數: ${pointsValue}`);
                }
                break;
                
            case 'lotteryTickets':
                const ticketsElement = document.getElementById('headerLotteryTickets');
                if (ticketsElement) {
                    ticketsElement.textContent = value.toString();
                    //console.log(`📊 UI更新 - 抽獎券: ${value}`);
                }
                break;
                
            case 'unusedProductsCount':
                const unusedElement = document.getElementById('headerUnusedCount');
                if (unusedElement) {
                    unusedElement.textContent = value.toString();
                    //console.log(`📊 UI更新 - 待使用商品: ${value}`);
                }
                break;
        }
    },
    
    // 安全更新（檢查是否有權威數據保護）
    safeUpdate(type, value, source = '背景更新') {
        if (this.authoritative[type] !== null) {
            console.log(`🛡️ ${type}受權威數據保護，忽略${source}的更新 (${value})`);
            return false;
        }
        
        console.log(`✅ 安全更新${type}: ${value} (來源: ${source})`);
        this.updateUI(type, value);
        return true;
    },
    
    // 強制更新（清除保護並更新）
    forceUpdate(type, value, source = '強制更新') {
        console.log(`🔥 強制更新${type}: ${value} (來源: ${source})`);
        this.authoritative[type] = null;
        this.updateUI(type, value);
    },
    
    // 獲取當前值
    getCurrent(type) {
        if (this.authoritative[type] !== null) {
            return this.authoritative[type];
        }
        
        // 從UI讀取當前值
        switch(type) {
            case 'points':
                const pointsEl = document.getElementById('headerPoints');
                return pointsEl ? parseInt(pointsEl.textContent) || 0 : 0;
            case 'lotteryTickets':
                const ticketsEl = document.getElementById('headerLotteryTickets');
                return ticketsEl ? parseInt(ticketsEl.textContent) || 0 : 0;
            case 'unusedProductsCount':
                const unusedEl = document.getElementById('headerUnusedCount');
                return unusedEl ? parseInt(unusedEl.textContent) || 0 : 0;
            default:
                return 0;
        }
    },
    
    // 設置最後更新時間
    setLastUpdate(type, date) {
        this.authoritative.lastUpdate = date;
        console.log(`📅 設置${type}最後更新時間: ${date}`);
    },
    
    // 🚀 統一更新所有用戶資料和頁面數據
    async updateAll(source = '統一更新', options = {}) {
        if (!currentUser || !currentUser.userId) return;
        
        const {
            // 現有選項
            updateActivities = false,
            updateRecords = false, 
            updateLottery = false,
            updateProducts = false,
            
            // 新增選項（來自fullSystemUpdate）
            forceRefresh = false,        // 是否強制清除快取
            skipUserData = false,        // 是否跳過用戶資料更新
            skipPages = [],              // 要跳過的頁面列表
            silent = false,              // 是否靜音模式
            setForceReloadFlags = false, // 是否設置其他頁面的強制重新載入標記
            
            // 智能選項
            smartMode = false,           // 智能模式：根據當前頁面自動決定要更新什麼
            fullSystemMode = false       // 全系統模式：更新所有關鍵頁面
        } = options;
        
        const startTime = performance.now();
        
        try {
            if (!silent) {
                console.log(`🔄 開始優化統一更新 (${source})`);
            }
            
            // Step 1: 清除快取（如果需要）
            if (forceRefresh) {
                if (!silent) console.log('🗑️ 強制清除所有快取...');
                cache.clearAll();
            } else if (fullSystemMode) {
                if (!silent) console.log('🗑️ 清除核心快取...');
                const keysToClean = ['products', 'exchangedResult', 'activities', 'userActivityStatus'];
                if (!skipUserData) {
                    keysToClean.push('userPoints', 'lotteryTickets');
                }
                keysToClean.forEach(key => cache.clear(key));
            }
            
            // Step 2: 決定要更新的內容
            let shouldUpdateActivities = updateActivities;
            let shouldUpdateRecords = updateRecords;
            let shouldUpdateLottery = updateLottery;
            let shouldUpdateProducts = updateProducts;
            
            if (smartMode) {
                // 智能模式：根據當前頁面自動決定
                shouldUpdateActivities = currentPageId === 'earnPage';
                shouldUpdateRecords = currentPageId === 'recordsPage';
                shouldUpdateLottery = currentPageId === 'lotteryPage';
                shouldUpdateProducts = currentPageId === 'productsPage';
            } else if (fullSystemMode) {
                // 全系統模式：更新所有關鍵頁面（除了跳過的）
                shouldUpdateActivities = !skipPages.includes('earnPage');
                shouldUpdateRecords = !skipPages.includes('recordsPage') && source.includes('手動');
                shouldUpdateLottery = !skipPages.includes('lotteryPage');
                shouldUpdateProducts = !skipPages.includes('productsPage');
            }
            
            // Step 3: 構建API請求 - 使用統一API管理器
            const apiRequests = [], priorityMap = {};
            
            // 基礎資料（除非明確跳過）
            if (!skipUserData) {
                apiRequests.push(
                    { action: 'getUserPoints' },
                    { action: 'getLotteryTickets' },
                    { action: 'getExchangedProducts', options: { method: 'POST' } }
                );
                priorityMap['getUserPoints'] = 'high';
                priorityMap['getLotteryTickets'] = 'high';
                priorityMap['getExchangedProducts'] = 'high';
            }
            
            // 活動資料
            if (shouldUpdateActivities) {
                apiRequests.push(
                    { action: 'getActivities' },
                    { action: 'getUserActivityStatus' }
                );
                priorityMap['getActivities'] = 'high';
                priorityMap['getUserActivityStatus'] = 'high';
            }
            
            // 記錄資料
            if (shouldUpdateRecords) {
                apiRequests.push(
                    { action: 'getPointHistory' },
                    { action: 'getLotteryHistory' }
                );
                priorityMap['getPointHistory'] = 'low';
                priorityMap['getLotteryHistory'] = 'low';
            }
            
            // 抽獎資料
            if (shouldUpdateLottery) {
                apiRequests.push(
                    { action: 'getLotteryPrizes' }
                );
                priorityMap['getLotteryPrizes'] = 'low';
            }
            
            // 商品資料
            if (shouldUpdateProducts) {
                apiRequests.push(
                    { action: 'getProducts' }
                );
                priorityMap['getProducts'] = 'high';
            }
            
            // Step 4: 並行執行所有請求 - 使用API管理器的批量請求
            const results = await APIManager.batchRequest(apiRequests, priorityMap);
            
            // Step 5: 處理結果
            let resultIndex = 0;
            
            // 處理基礎資料
            if (!skipUserData) {
                const [pointsResult, ticketsResult, exchangedResult] = results.slice(resultIndex, resultIndex + 3);
                resultIndex += 3;
                
                // 更新點數
                if (pointsResult && pointsResult.value ? pointsResult.value.success : pointsResult.success) {
                    let points = pointsResult.value ? pointsResult.value.data.currentPoints : pointsResult.data.currentPoints;
                    this.safeUpdate('points', points, source);
                }
                
                // 更新抽獎券
                if (ticketsResult && ticketsResult.value ? ticketsResult.value.success : ticketsResult.success) {
                    const tickets = ticketsResult.value ? ticketsResult.value.data.currentTickets : ticketsResult.data.currentTickets;
                    this.safeUpdate('lotteryTickets', tickets, source);
                }
                
                // 更新兌換商品
                if (exchangedResult && exchangedResult.value ? exchangedResult.value.success : exchangedResult.success) {
                    const data = exchangedResult.value ? exchangedResult.value.data : exchangedResult.data;
                    setTimeout(() => {
                        const now = new Date();
                        const unusedCount = data.filter(product => {
                            const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                            const isUseExpired = product.useExpirationDate && new Date(product.useExpirationDate) < now;
                            return product.status === '未使用' && !isExpired && !isUseExpired && !product.isExpired;
                        }).length;
                        this.setAuthoritative('unusedProductsCount', unusedCount, source);
                        
                        this.pageData.exchangedProducts = data;
                        this.pageUpdateFlags.exchangedPage = true;
                        
                        if (currentPageId === 'exchangedPage') {
                            displayExchangedProducts(data);
                        }
                    }, 0);
                }
            }
            
            // 處理活動資料
            if (shouldUpdateActivities) {
                const activitiesResult = results[resultIndex];
                const statusResult = results[resultIndex + 1];
                resultIndex += 2;
                
                if (activitiesResult && (activitiesResult.value ? activitiesResult.value.success : activitiesResult.success)) {
                    const data = activitiesResult.value ? activitiesResult.value.data : activitiesResult.data;
                    setTimeout(() => {
                        this.pageData.activities = data;
                        this.pageUpdateFlags.earnPage = true;
                        if (currentPageId === 'earnPage') {
                            displayActivities(data);
                        }
                    }, 0);
                }
                
                if (statusResult && (statusResult.value ? statusResult.value.success : statusResult.success)) {
                    const data = statusResult.value ? statusResult.value.data : statusResult.data;
                    setTimeout(() => {
                        this.pageData.userActivityStatus = data;
                        userActivityStatus = data;
                    }, 0);
                }
            }
            
            // 處理記錄資料
            if (shouldUpdateRecords) {
                const pointHistoryResult = results[resultIndex];
                const lotteryHistoryResult = results[resultIndex + 1];
                resultIndex += 2;
                
                if (pointHistoryResult && (pointHistoryResult.value ? pointHistoryResult.value.success : pointHistoryResult.success)) {
                    const data = pointHistoryResult.value ? pointHistoryResult.value.data : pointHistoryResult.data;
                    setTimeout(() => {
                        this.pageData.pointHistory = data;
                        this.pageUpdateFlags.recordsPage = true;
                        
                        if (currentPageId === 'recordsPage') {
                            const activeTab = document.querySelector('#recordsPage .tab-content.active');
                            if (activeTab && activeTab.id === 'pointsRecordsTab') {
                                displayPointHistory(data);
                            }
                        }
                    }, 0);
                }
                
                if (lotteryHistoryResult && (lotteryHistoryResult.value ? lotteryHistoryResult.value.success : lotteryHistoryResult.success)) {
                    const data = lotteryHistoryResult.value ? lotteryHistoryResult.value.data : lotteryHistoryResult.data;
                    setTimeout(() => {
                        this.pageData.lotteryHistory = data;
                        
                        if (currentPageId === 'recordsPage') {
                            const activeTab = document.querySelector('#recordsPage .tab-content.active');
                            if (activeTab && activeTab.id === 'lotteryRecordsTab') {
                                displayLotteryHistory(data.records, data.currentTickets);
                            }
                        }
                    }, 0);
                }
            }
            
            // 處理抽獎資料
            if (shouldUpdateLottery) {
                const prizesResult = results[resultIndex];
                resultIndex += 1;
                
                if (prizesResult && (prizesResult.value ? prizesResult.value.success : prizesResult.success)) {
                    const data = prizesResult.value ? prizesResult.value.data : prizesResult.data;
                    setTimeout(() => {
                        this.pageData.lotteryPrizes = data;
                        this.pageUpdateFlags.lotteryPage = true;
                        
                        if (currentPageId === 'lotteryPage') {
                            displayLotteryPrizes(data);
                        }
                    }, 0);
                }
            }
            
            // 處理商品資料
            if (shouldUpdateProducts) {
                const productsResult = results[resultIndex];
                
                if (productsResult && (productsResult.value ? productsResult.value.success : productsResult.success)) {
                    const data = productsResult.value ? productsResult.value.data : productsResult.data;
                    setTimeout(() => {
                        this.pageData.products = data;
                        this.pageUpdateFlags.productsPage = true;
                        
                        if (currentPageId === 'productsPage') {
                            displayProducts(data);
                        }
                    }, 0);
                }
            }
            
            // Step 6: 設置強制重新載入標記（如果需要）
            if (setForceReloadFlags) {
                const affectedPages = ['exchangedPage', 'productsPage', 'lotteryPage', 'earnPage'];
                affectedPages.forEach(page => {
                    if (page !== currentPageId && !skipPages.includes(page)) {
                        cache.set(`forceReload_${page}`, true, 600000);
                    }
                });
                if (!silent) console.log('📌 已設置其他頁面的強制重新載入標記');
            }
            
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            
            if (!silent) {
                console.log(`✅ 優化統一更新完成! 耗時: ${duration}ms (${source})`);
            }
            
            return { success: true, duration, source };
            
        } catch (error) {
            console.error(`❌ 優化統一更新失敗 (${source}):`, error);
            return { success: false, error: error.toString() };
        }
    },
    
    // 獲取頁面數據（如果沒有則返回null）
    getPageData(pageType) {
        return this.pageData[pageType];
    },
    
    // 清除頁面數據快取
    clearPageData(pageType = null) {
        if (pageType) {
            this.pageData[pageType] = null;
            this.pageUpdateFlags[pageType] = false;
        } else {
            // 清除所有頁面數據
            Object.keys(this.pageData).forEach(key => {
                this.pageData[key] = null;
            });
            Object.keys(this.pageUpdateFlags).forEach(key => {
                this.pageUpdateFlags[key] = false;
            });
        }
    },
    
    // 檢查頁面是否需要更新
    needsPageUpdate(pageId) {
        const pageTypeMap = {
            'exchangedPage': 'exchangedPage',
            'earnPage': 'earnPage',
            'recordsPage': 'recordsPage',
            'lotteryPage': 'lotteryPage',
            'productsPage': 'productsPage',
            'leaderboardPage': 'leaderboardPage'
        };
        
        const pageType = pageTypeMap[pageId];
        return pageType ? !this.pageUpdateFlags[pageType] : true;
    }
};

// 統一即時更新系統
const instantUpdate = {
    // 正在更新的項目追蹤
    updating: new Set(),
    
    // 立即更新用戶資料（點數、抽獎券等）
    async updateUserData(silent = true, source = 'updateUserData') {
        if (this.updating.has('userData')) return;
        this.updating.add('userData');
        
        try {
            if (!currentUser || !currentUser.userId) return;
            
            // 🔍 檢查是否有權威數據快取（避免覆蓋最新的 API 回應數據）
            const cachedPoints = cache.get('userPoints');
            const cachedTickets = cache.get('lotteryTickets');
            
            // 如果有新鮮的快取數據，優先使用
            if (cachedPoints && cache.getAge('userPoints') < 60000) { // 1分鐘內的快取
                console.log('🎯 使用權威點數快取，跳過 API 請求');
                UserDataManager.safeUpdate('points', cachedPoints, '權威快取');
                
                if (cachedTickets && cache.getAge('lotteryTickets') < 60000) {
                    console.log('🎯 使用權威抽獎券快取，跳過 API 請求');
                    
                    if (!silent) {
                        console.log('✅ 用戶資料已使用權威快取更新');
                    }
                    return;
                }
            }
            
            // 並行獲取用戶點數和抽獎券
            const [pointsResponse, ticketsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}?action=getUserPoints&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`),
                fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`)
            ]);
            
            const [pointsResult, ticketsResult] = await Promise.all([
                pointsResponse.json(),
                ticketsResponse.json()
            ]);
            
            // 立即更新顯示（但只在沒有權威快取時）
            if (pointsResult.success && !cachedPoints) {
                console.log('📊 使用 API 數據更新點數顯示:', pointsResult.data);
                UserDataManager.safeUpdate('points', pointsResult.data, source);
                cache.set('userPoints', pointsResult.data, 60000); // 1分鐘快取
            } else if (pointsResult.success && cachedPoints) {
                console.log('⏭️ 跳過點數顯示更新（保留權威快取）');
                // 仍然更新快取，但不更新顯示
                cache.set('userPoints', pointsResult.data, 60000);
            }
            
            if (ticketsResult.success && !cachedTickets) {
                console.log('🎫 使用 API 數據更新抽獎券:', ticketsResult.data.currentTickets);
                cache.set('lotteryTickets', ticketsResult.data, 60000); // 1分鐘快取
            } else if (ticketsResult.success && cachedTickets) {
                console.log('⏭️ 跳過抽獎券顯示更新（保留權威快取）');
                // 仍然更新快取，但不更新顯示
                cache.set('lotteryTickets', ticketsResult.data, 60000);
            }
            
            if (!silent) {
                console.log('✅ 用戶資料已即時更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 用戶資料更新失敗:', error);
            }
        } finally {
            this.updating.delete('userData');
        }
    },
    
    // 立即更新指定頁面資料
    async updatePageData(pageId, silent = true) {
        if (this.updating.has(pageId)) return;
        this.updating.add(pageId);
        
        try {
        switch (pageId) {
                case 'recordsPage':
                    await this.updateRecordsData(silent, '自動更新');
                break;
            case 'exchangedPage':
                    await this.updateExchangedData(silent);
                break;
                case 'earnPage':
                    await this.updateEarnData(silent);
                break;
                case 'productsPage':
                    await this.updateProductsData(silent);
                    break;
                            case 'leaderboardPage':
                    await this.updateLeaderboardData(silent);
                    break;
                case 'lotteryPage':
                    await this.updateLotteryData(silent);
                    break;
            }
        } finally {
            this.updating.delete(pageId);
        }
    },
    
    // 更新記錄頁面資料（靜態模式：只在手動更新時調用）
    async updateRecordsData(silent = true, source = '未知來源') {
        if (!currentUser || !currentUser.userId) return;
        
        // 🔥 靜態頁面檢查：只允許手動更新
        if (!source.includes('手動')) {
            console.log('🚫 記錄頁面為靜態模式，拒絕自動更新，來源:', source);
            return;
        }
        
        try {
                        const [pointsResponse, lotteryResponse] = await Promise.all([
                            fetch(`${API_BASE_URL}?action=getPointHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`),
                            fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`)
                        ]);
                        
                        const [pointsResult, lotteryResult] = await Promise.all([
                            pointsResponse.json(),
                            lotteryResponse.json()
                        ]);
                        
            // 更新快取並保存時間戳
                        if (pointsResult.success) {
                cache.set('pointHistory', pointsResult.data, 7200000); // 靜態模式：2小時快取
                UpdateTimeManager.saveUpdateTime('pointHistory');
                        }
                        if (lotteryResult.success) {
                cache.set('lotteryHistory', lotteryResult.data, 7200000); // 靜態模式：2小時快取
                UpdateTimeManager.saveUpdateTime('lotteryHistory');
            }
            
            // 如果當前在記錄頁面，立即更新顯示
            if (currentPageId === 'recordsPage') {
                const activeTab = document.querySelector('#recordsPage .tab-content.active');
                if (activeTab && activeTab.id === 'pointsRecordsTab' && pointsResult.success) {
                    displayPointHistory(pointsResult.data);
                } else if (activeTab && activeTab.id === 'lotteryRecordsTab' && lotteryResult.success) {
                    displayLotteryHistory(lotteryResult.data.records, lotteryResult.data.currentTickets);
                }
            }
            
            if (!silent) {
                console.log('✅ 記錄頁面資料已更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 記錄頁面資料更新失敗:', error);
            }
        }
    },
    
    // 更新已兌換商品資料
    async updateExchangedData(silent = true) {
        if (!currentUser || !currentUser.userId) return;
        
        try {
                        const response = await fetch(API_BASE_URL, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                            body: `action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
                        });
                        const result = await response.json();
            
                        if (result.success) {
                cache.set('exchangedResult', result, 300000);
                
                // 智能渲染已兌換頁面
                DisplayManager.smartRender('exchangedPage', result.data, displayExchangedProducts);
                
                // 更新待使用商品數量顯示
                await this.updateUnusedProductsCount(result.data, true);
            }
            
            if (!silent) {
                console.log('✅ 已兌換商品資料已更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 已兌換商品資料更新失敗:', error);
            }
        }
    },
    
    // 更新賺點頁面資料
    async updateEarnData(silent = true) {
        if (!currentUser || !currentUser.userId) return;
        
        try {
                        const [activitiesResponse, statusResponse] = await Promise.all([
                            fetch(`${API_BASE_URL}?action=getActivities&accessToken=${liff.getAccessToken()}`),
                            fetch(`${API_BASE_URL}?action=getUserActivityStatus&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`)
                        ]);
                        
                        const [activitiesResult, statusResult] = await Promise.all([
                            activitiesResponse.json(),
                            statusResponse.json()
                        ]);
                        
                        if (activitiesResult.success) {
                            cache.set('activities', activitiesResult.data, 300000);
                        }
                        if (statusResult.success) {
                            cache.set('userActivityStatus', statusResult.data, 120000);
                userActivityStatus = statusResult.data;
            }
            
            // 如果當前在賺點頁面，立即更新顯示
            if (currentPageId === 'earnPage' && activitiesResult.success) {
                displayActivities(activitiesResult.data);
            }
            
            if (!silent) {
                console.log('✅ 賺點頁面資料已更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 賺點頁面資料更新失敗:', error);
            }
        }
    },
    
    // 更新商品頁面資料
    async updateProductsData(silent = true) {
        try {
            const response = await fetch(`${API_BASE_URL}?action=getProducts&accessToken=${liff.getAccessToken()}`);
            const result = await response.json();
            
            if (result.success) {
                SmartCacheManager.smartSet('products', result.data, 'products');
                
                // 智能渲染商品頁面
                DisplayManager.smartRender('productsPage', result.data, displayProducts);
            }
            
            if (!silent) {
                console.log('✅ 商品頁面資料已更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 商品頁面資料更新失敗:', error);
            }
        }
    },
    
    // 更新排行榜資料
    async updateLeaderboardData(silent = true) {
        if (!currentUser || !currentUser.userId) return;
        
        try {
            // 🔥 修復：檢查是否有權威點數數據，確保重新載入
            const hasAuthoritativeData = this.authoritative.points !== null;
            if (hasAuthoritativeData && !silent) {
                console.log('🔄 檢測到權威點數數據，強制重新載入排行榜...');
            }
            
            const response = await fetch(`${API_BASE_URL}?action=getLeaderboard&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
            const result = await response.json();
            
            if (result.success) {
                // 🔥 強制更新快取，確保最新數據
                cache.set('leaderboard', result.data, 7200000); // 靜態模式：2小時快取
                this.pageData.leaderboard = result.data;
                
                // 如果當前在排行榜頁面，立即更新顯示
                if (currentPageId === 'leaderboardPage') {
                    displayLeaderboard(result.data.leaderboard, result.data.myRank);
                    console.log('✅ 排行榜頁面已即時更新');
                }
            }
            
            if (!silent) {
                console.log('✅ 排行榜資料已更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 排行榜資料更新失敗:', error);
            }
        }
    },
    
    // 更新抽獎頁面資料
    async updateLotteryData(silent = true) {
        if (!currentUser || !currentUser.userId) return;
        
        try {
            const [ticketsResponse, historyResponse] = await Promise.all([
                fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`),
                fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`)
            ]);
            
            const [ticketsResult, historyResult] = await Promise.all([
                ticketsResponse.json(),
                historyResponse.json()
            ]);
            
            if (ticketsResult.success) {
                cache.set('lotteryTickets', ticketsResult.data, 60000);
            }
            
            if (historyResult.success) {
                cache.set('lotteryHistory', historyResult.data, 180000);
            }
            
            if (!silent) {
                console.log('✅ 抽獎頁面資料已更新');
            }
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 抽獎頁面資料更新失敗:', error);
            }
        }
    },
    
    // 更新待使用商品數量
    async updateUnusedProductsCount(exchangedData = null, silent = true) {
        try {
            let data = exchangedData;
            if (!data) {
                if (!currentUser || !currentUser.userId) return;
                const response = await fetch(API_BASE_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
                });
                const result = await response.json();
                if (result.success) {
                    data = result.data;
                    // 更新快取
                    cache.set('exchangedResult', result, 300000);
                } else {
                    return;
                }
            }
            
            // 計算待使用商品數量（未使用且未過期）
            const now = new Date();
            const unusedCount = data.filter(product => {
                const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                const isUseExpired = product.useExpirationDate && new Date(product.useExpirationDate) < now;
                return product.status === '未使用' && !isExpired && !isUseExpired && !product.isExpired;
            }).length;
            
            // 🔒 使用權威數據更新，比照點數和抽獎券處理方式
            UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, '商品數量更新');
            
            // 🏷️ 更新導航徽章（如果存在）
            const badge = document.querySelector('.nav-badge');
            if (badge) {
                if (unusedCount > 0) {
                    badge.textContent = unusedCount;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
            
            // 🏷️ 更新已兌換頁面的標籤數量（如果在該頁面）
            if (currentPageId === 'exchangedPage') {
                const unusedTab = document.getElementById('unusedTabBtn');
                if (unusedTab) {
                    unusedTab.innerHTML = `<i class="bi bi-box-seam"></i> 待使用商品 (${unusedCount})`;
                }
            }
            
            if (!silent) {
                console.log(`✅ 待使用商品數量已更新: ${unusedCount}`);
            }
            
            return unusedCount; // 返回數量供其他函數使用
            
        } catch (error) {
            if (!silent) {
                console.error('❌ 待使用商品數量更新失敗:', error);
            }
            return 0;
        }
    },
    
    // 操作後的統一更新邏輯
    async afterOperation(operationType, affectedPages = []) {
        console.log(`🔄 操作完成後全面更新: ${operationType}, 影響頁面: ${affectedPages.join(', ')}`);
        
        // 🚀 **全面更新策略**：任何操作都更新所有核心資料
        const startTime = performance.now();
        
        try {
            // 1. 立即更新用戶資料（點數、抽獎券）- 最高優先級
            console.log('📊 更新用戶資料 (點數、抽獎券)...');
            await this.updateUserData(false); // 不靜默，顯示更新過程
            
            // 2. 清除所有相關快取，確保獲取最新資料
            console.log('🗑️ 清除舊快取...');
            cache.clear('products');
            cache.clear('exchangedResult');
            cache.clear('activities');
            cache.clear('userActivityStatus');
            
            // 3. 根據操作類型決定需要更新的頁面
            const allCriticalPages = new Set(affectedPages);
            
            // 📦 商品相關操作：確保更新商品和兌換頁面
            if (['商品兌換', 'QR掃描領取', '按鈕領取'].includes(operationType)) {
                allCriticalPages.add('productsPage');
                allCriticalPages.add('exchangedPage');
                console.log('🛒 商品相關操作，添加商品頁面到更新列表');
            }
            
            // 🎯 點數相關操作：不再自動更新記錄和排行榜頁面（改為完全靜態）
            if (['按鈕領取', 'QR掃描領取', '商品兌換', '商品使用'].includes(operationType)) {
                // 移除記錄和排行榜的自動更新，改為完全靜態模式
                console.log('💰 點數相關操作，記錄和排行榜頁面保持靜態（不自動更新）');
            }
            
            // 🎫 抽獎券相關操作：確保更新抽獎頁面
            if (['按鈕領取', '商品兌換', '商品使用', '抽獎'].includes(operationType)) {
                allCriticalPages.add('lotteryPage');
                console.log('🎰 抽獎券相關操作，添加抽獎頁面');
            }
            
            // 4. 並行更新所有相關頁面資料
            const finalPagesList = Array.from(allCriticalPages);
            console.log('📄 準備更新頁面:', finalPagesList);
            
            if (finalPagesList.length > 0) {
                const updatePromises = finalPagesList.map(pageId => {
                    console.log(`  ⚡ 開始更新: ${pageId}`);
                    return this.updatePageData(pageId, true);
                });
                await Promise.all(updatePromises);
            }
            
            // 5. 如果當前在商品頁面，立即重新載入顯示
            if (currentPageId === 'productsPage' && 
                ['商品兌換', '按鈕領取', 'QR掃描領取'].includes(operationType)) {
                console.log('🔄 當前在商品頁面，立即重新載入...');
                await loadProducts();
            }
            
            // 7. 📌 設置其他頁面的強制重新載入標記（但不包含靜態頁面）
            const otherPages = ['exchangedPage', 'productsPage', 'lotteryPage', 'earnPage']; // 移除靜態頁面
            otherPages.forEach(page => {
                if (page !== currentPageId && !finalPagesList.includes(page)) {
                    cache.set(`forceReload_${page}`, true, 600000); // 10分鐘有效期
                }
            });
            
            const endTime = performance.now();
            console.log(`✅ ${operationType} 全面更新完成! 耗時: ${Math.round(endTime - startTime)}ms`);
            console.log(`📋 更新摘要: 用戶資料 + ${finalPagesList.length}個頁面`);
            console.log(`📌 已為其他頁面設置強制重新載入標記`);
            
        } catch (error) {
            console.error(`❌ ${operationType} 全面更新失敗:`, error);
            // 即使部分更新失敗，也要確保基本的用戶資料是最新的
            try {
                await this.updateUserData(true);
            } catch (fallbackError) {
                console.error('❌ 用戶資料備用更新也失敗:', fallbackError);
            }
        }
    },
    
    // 🚀 **超級全面更新函數**：確保所有相關資訊都最新
    async fullSystemUpdate(operationType = '手動更新', options = {}) {
        // 重構：使用增強版 updateAll 來實現全系統更新
        const result = await this.updateAll(operationType, {
            ...options,
            fullSystemMode: true,        // 啟用全系統模式
            setForceReloadFlags: true,   // 設置強制重新載入標記
            updateActivities: true,      // 更新活動
            updateLottery: true,         // 更新抽獎
            updateProducts: true,        // 更新商品
            updateRecords: operationType.includes('手動') // 只有手動更新才更新記錄
        });
        
        // 特別處理：如果當前在商品頁面，確保立即重新載入
        if (currentPageId === 'productsPage' && !options.skipPages?.includes('productsPage')) {
            try {
                await loadProducts();
                if (!options.silent) console.log('🛒 商品頁面已立即重新載入');
            } catch (error) {
                console.error('❌ 商品頁面重新載入失敗:', error);
            }
        }
        
        return result;
         },
};

/**
 * 🚀 統一更新系統使用指南
 * 
 * 新的 updateAll() 函數整合了原本的 updateAll() 和 fullSystemUpdate() 功能
 * 
 * === 基本用法 ===
 * 
 * 1. 智能模式（推薦）：
 *    UserDataManager.updateAll('操作描述', { smartMode: true });
 *    - 自動根據當前頁面決定要更新什麼
 * 
 * 2. 全系統模式：
 *    UserDataManager.updateAll('手動更新', { fullSystemMode: true });
 *    - 更新所有關鍵頁面（等同於舊的 fullSystemUpdate）
 * 
 * 3. 指定頁面更新：
 *    UserDataManager.updateAll('特定更新', {
 *        updateProducts: true,
 *        updateActivities: true
 *    });
 * 
 * 4. 進階選項：
 *    UserDataManager.updateAll('進階更新', {
 *        forceRefresh: true,          // 強制清除快取
 *        skipUserData: true,          // 跳過用戶資料更新
 *        skipPages: ['recordsPage'],  // 跳過特定頁面
 *        silent: true,                // 靜音模式
 *        setForceReloadFlags: true    // 設置其他頁面的強制重新載入標記
 *    });
 * 
 * === 常見使用場景 ===
 * 
 * - 商品兌換後：updateAll('商品兌換即時更新', { smartMode: true })
 * - 手動重新整理：updateAll('重新整理即時更新', { fullSystemMode: true })
 * - QR掃描後：updateAll('QR掃描背景更新', { updateActivities: true })
 * - 抽獎後：updateAll('抽獎背景更新', { updateLottery: true })
 * 
 * === 向後兼容 ===
 * 
 * - fullSystemUpdate() 仍然可用，內部會調用新的 updateAll()
 * - 舊的調用方式仍然有效，但建議逐步遷移到新接口
 */

// 智能更新系統（保持向後兼容）
const smartUpdate = {
    // 追蹤需要更新的頁面
    pendingUpdates: new Set(),
    
    // 標記需要更新的頁面
    markForUpdate(pageIds) {
        if (Array.isArray(pageIds)) {
            pageIds.forEach(id => this.pendingUpdates.add(id));
        } else {
            this.pendingUpdates.add(pageIds);
        }
        console.log('📝 標記需要更新的頁面:', Array.from(this.pendingUpdates));
    },
    
    // 檢查並執行更新（在切換頁面時調用）
    checkAndUpdate(targetPageId) {
        if (this.pendingUpdates.has(targetPageId)) {
            console.log(`⚡ 智能更新已在背景完成: ${targetPageId}`);
            this.pendingUpdates.delete(targetPageId);
            return true; // 返回true表示有更新
        }
        return false;
    },
    
    // 背景更新指定頁面（使用新的即時更新系統）
    async backgroundUpdate(pageIds) {
        console.log('🔄 開始背景更新頁面:', pageIds);
        if (Array.isArray(pageIds)) {
            for (const pageId of pageIds) {
                await instantUpdate.updatePageData(pageId, true);
            }
        } else {
            await instantUpdate.updatePageData(pageIds, true);
        }
        console.log('✅ 背景更新完成');
    },
    
    // 立即更新當前頁面
    updateCurrentPage() {
        if (currentPageId !== 'mainPage') {
            console.log(`🔄 立即更新當前頁面: ${currentPageId}`);
            instantUpdate.updatePageData(currentPageId, false);
        }
    },
    
    // 執行具體的更新邏輯（重定向到新系統）
    executeUpdate(pageId) {
        instantUpdate.updatePageData(pageId, false);
    },
    
    // 背景更新邏輯（重定向到新系統）
    async executeBackgroundUpdate(pageId) {
        await instantUpdate.updatePageData(pageId, true);
    }
};

// 智能快取管理
const cache = {
    data: {},
    timestamps: {},
    createTimes: {},
    
    set(key, value, ttl = 300000) { // 預設5分鐘快取
        this.data[key] = value;
        this.timestamps[key] = Date.now() + ttl;
        this.createTimes[key] = Date.now();
    },
    
    get(key) {
        if (this.data[key] && this.timestamps[key] > Date.now()) {
            PerformanceManager.recordCacheHit();
            return this.data[key];
        }
        this.clear(key);
        PerformanceManager.recordCacheMiss();
        return null;
    },
    
    // 獲取快取但不檢查過期時間（用於立即顯示舊資料）
    getStale(key) {
        return this.data[key] || null;
    },
    
    // 檢查快取是否過期
    isExpired(key) {
        return !this.data[key] || this.timestamps[key] <= Date.now();
    },
    
    // 獲取快取創建時間
    getAge(key) {
        return this.createTimes[key] ? Date.now() - this.createTimes[key] : Infinity;
    },
    
    clear(key) {
        delete this.data[key];
        delete this.timestamps[key];
        delete this.createTimes[key];
    },
    
    clearAll() {
        this.data = {};
        this.timestamps = {};
        this.createTimes = {};
    }
};

// ========== 更新時間管理器 ==========
const UpdateTimeManager = {
    // 保存更新時間
    saveUpdateTime(dataType) {
        const now = new Date().getTime();
        localStorage.setItem(`${dataType}_lastUpdate`, now);
        console.log(`⏰ 已保存 ${dataType} 更新時間: ${new Date(now).toLocaleString()}`);
    },

    // 獲取更新時間
    getUpdateTime(dataType) {
        const timestamp = localStorage.getItem(`${dataType}_lastUpdate`);
        return timestamp ? new Date(parseInt(timestamp)) : null;
    },

    // 計算時間差顯示文字
    getTimeAgo(dataType) {
        const lastUpdate = this.getUpdateTime(dataType);
        if (!lastUpdate) return '未更新';
        
        const diff = Date.now() - lastUpdate.getTime();
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return '剛剛更新';
        if (minutes < 60) return `${minutes}分鐘前更新`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}小時前更新`;
        const days = Math.floor(hours / 24);
        return `${days}天前更新`;
    },

    // 更新時間顯示
    updateTimeDisplay(dataType, elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = this.getTimeAgo(dataType);
        }
    },

    // 檢查是否需要更新（超過指定時間）
    needsUpdate(dataType, maxAge = 600000) { // 預設10分鐘
        const lastUpdate = this.getUpdateTime(dataType);
        if (!lastUpdate) return true;
        return Date.now() - lastUpdate.getTime() > maxAge;
    }
};

// 初始化 LIFF - 超快速版本
async function initializeLiff() {
    try {
        await liff.init({ liffId: '2007573269-X7EOlxw2' }); // 需要替換為實際的LIFF ID
        liffInitialized = true;
        
        if (liff.isLoggedIn()) {
            // 超快速並行載入所有資料
            await loadAllDataUltraFast();
        } else {
            liff.login();
        }
    } catch (error) {
        console.error('LIFF初始化失敗:', error);
        // 隱藏進度條
        ProgressManager.hide();
        showAlert('系統初始化失敗', 'danger');
    }
}

// 獲取步驟顯示名稱
function getStepDisplayName(stepName) {
    const stepNames = {
        lineProfile: 'LINE基本資料載入',
        basicUI: '基本UI更新',
        dataFetch: '並行資料載入',
        bindingCheck: '綁定狀態檢查',
        uiUpdate: 'UI更新處理',
        cacheAndRender: '快取與預渲染'
    };
    return stepNames[stepName] || stepName;
}

// 獲取立即載入步驟顯示名稱
function getImmediateStepDisplayName(stepName) {
    const stepNames = {
        lineProfileFetch: 'LINE資料獲取',
        profileUIUpdate: '基本UI更新',
        bindingDataFetch: '綁定資料載入',
        cacheDisplay: '快取資料顯示'
    };
    return stepNames[stepName] || stepName;
}

// 更新次要功能UI（包含活動和商品）
function updateSecondaryUI(results) {
    const [activitiesResult, productsResult, exchangedResult, lotteryResult, prizesResult, leaderboardResult, pointHistoryResult, lotteryHistoryResult, userActivityStatusResult] = results;
    
    console.log('🔄 開始更新次要功能UI...');
    
    // 更新活動列表
    if (activitiesResult && activitiesResult.success) {
        const earnActivitiesList = document.getElementById('earnActivitiesList');
        if (earnActivitiesList) {
            displayActivities(activitiesResult.data);
        }
        // 快取活動資料
        cache.set('activities', activitiesResult.data, 300000); // 5分鐘快取
    }
    
    // 更新商品列表
    if (productsResult && productsResult.success) {
        const productsContainer = document.getElementById('productsList');
        if (productsContainer) {
            displayProducts(productsResult.data);
        }
        // 快取商品資料
        cache.set('products', productsResult.data, 300000); // 5分鐘快取
    }
    
    // 更新已兌換商品
    if (exchangedResult && exchangedResult.success) {
        const unusedList = document.getElementById('unusedProductsList');
        const usedList = document.getElementById('usedProductsList');
        if (unusedList && usedList) {
            displayExchangedProducts(exchangedResult.data);
        }
    }
    
    // 更新抽獎相關
    if (lotteryResult && lotteryResult.success) {
        document.getElementById('headerLotteryTickets').textContent = (lotteryResult.data?.currentTickets || 0).toString();
        UserDataManager.safeUpdate('lotteryTickets', lotteryResult.data?.currentTickets || 0, 'secondary');
    }
    
    // 更新抽獎獎品和九宮格
    if (prizesResult && prizesResult.success) {
        const lotteryContainer = document.getElementById('lotteryPrizesContainer');
        if (lotteryContainer) {
            displayLotteryPrizes(prizesResult.data);
        }
        preGenerateLotteryGrid(prizesResult.data);
        generateSimpleLotteryGrid(prizesResult.data);
    }
    
    // 更新歷史記錄
    if (pointHistoryResult && pointHistoryResult.success) {
        const historyList = document.getElementById('historyList');
        if (historyList) {
            displayPointHistory(pointHistoryResult.data);
        }
    }
    
    // 更新抽獎歷史
    if (lotteryHistoryResult && lotteryHistoryResult.success) {
        const lotteryHistoryList = document.getElementById('lotteryHistoryList');
        if (lotteryHistoryList) {
            displayLotteryHistory(lotteryHistoryResult.data.records, lotteryHistoryResult.data.currentTickets);
        }
    }
    
    // 更新排行榜
    if (leaderboardResult && leaderboardResult.success) {
        const leaderboardList = document.getElementById('leaderboardList');
        if (leaderboardList) {
            displayLeaderboard(leaderboardResult.data);
        }
    }
    
    console.log('✅ 次要功能UI更新完成');
}

// 獲取優化載入步驟顯示名稱
function getOptimizedStepDisplayName(stepName) {
    const stepNames = {
        dataFetchAll: '並行資料載入',
        dataCaching: '資料快取',
        userDataUpdate: '用戶資料更新',
        uiRenderAll: 'UI預渲染',
        backgroundSetup: '背景服務設置'
    };
    return stepNames[stepName] || stepName;
}

// Firebase 一次性載入所有資料 - 如同原始備份的模式
async function loadAllDataUltraFast() {
    const startTime = performance.now();
    const performanceLog = {
        total: 0,
        steps: {}
    };
    
    console.log('🚀 開始超快速並行載入所有資料...');
    
    // 進度條已在 DOMContentLoaded 中初始化，這裡不需要重複調用
    
    try {
        // 1. 立即獲取並顯示LINE基本資料
        const step1Start = performance.now();
        const profile = await liff.getProfile();
        currentUser = profile;
        performanceLog.steps.lineProfile = performance.now() - step1Start;
        console.log(`⏱️ LINE基本資料載入: ${performanceLog.steps.lineProfile.toFixed(2)}ms`);
        
        // 2. 立即更新基本UI
        const step2Start = performance.now();
        document.getElementById('userName').textContent = profile.displayName;
        document.getElementById('userAvatar').textContent = profile.displayName.charAt(0);
        
        // 設定頭像
        if (profile.pictureUrl) {
            const avatar = document.getElementById('userAvatar');
            avatar.style.backgroundImage = `url(${profile.pictureUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.textContent = '';
        }
        performanceLog.steps.basicUI = performance.now() - step2Start;
        console.log(`⏱️ 基本UI更新: ${performanceLog.steps.basicUI.toFixed(2)}ms`);

        // 3. 分階段載入：先載入關鍵資料，再載入次要資料
        const step3Start = performance.now();
        
        // 🚀🚀🚀 Firebase 一次性載入所有資料（如同原始備份模式）
        const firebaseResult = await FirebaseDataManager.loadAllData(profile.userId);
        
        performanceLog.steps.firebase = performance.now() - step3Start;
        console.log(`⚡ Firebase 資料載入: ${performanceLog.steps.firebase.toFixed(2)}ms`);
        
        if (!firebaseResult.success) {
            console.warn(`Firebase載入失敗: ${firebaseResult.error}，降級至 Google Apps Script`);
            // 降級到原有 Google Apps Script 方式
            await loadUserProfileImmediate();
            return;
        }
        
        const userData = firebaseResult.userData;
        
        // 4. 檢查綁定狀態
        const step4Start = performance.now();
        if (!userData) {
            // 顯示未綁定提示
            document.getElementById('mainContent').innerHTML = `
                <div class="alert alert-warning text-center mt-4" role="alert">
                    <h4 class="alert-heading mb-3">⚠️ 尚未綁定帳號</h4>
                    <p class="mb-3">請先完成帳號綁定才能使用點數系統功能！</p>
                    <button onclick="liff.closeWindow()" class="btn btn-primary">關閉視窗</button>
                </div>
            `;
            document.querySelectorAll('.menu-item, .function-btn').forEach(el => {
                el.style.display = 'none';
            });
            ProgressManager.complete();
            return;
        }
        performanceLog.steps.binding = performance.now() - step4Start;
        console.log(`⏱️ 綁定狀態檢查: ${performanceLog.steps.binding.toFixed(2)}ms`);
        
        // 5. 一次性更新所有 UI（如同原始載入模式）
        const step5Start = performance.now();
        await Promise.all([
            // 更新電話顯示
            (() => {
                const phoneField = userData.customerPhone || '';
                let displayPhone = '未設定電話';
                
                if (phoneField) {
                    let phoneStr = String(phoneField).trim();
                    if (phoneStr.length === 9 && /^\d{9}$/.test(phoneStr)) {
                        displayPhone = '0' + phoneStr;
                    } else if (phoneStr.length === 10 && phoneStr.startsWith('0') && /^\d{10}$/.test(phoneStr)) {
                        displayPhone = phoneStr;
                    } else if (phoneStr) {
                        displayPhone = phoneStr;
                    }
                }
                document.getElementById('userPhone').textContent = displayPhone;
            })(),
            
            // 更新會員等級顯示
            (() => {
                const memberLevel = userData.memberLevel || '一般會員';
                const levelStyle = getMemberLevelStyle(memberLevel);
                const accountStatusElement = document.getElementById('accountStatus');
                if (accountStatusElement) {
                    accountStatusElement.textContent = levelStyle.levelName;
                    accountStatusElement.className = `account-status-large ${levelStyle.className}`;
                }
            })(),
            
            // 更新點數顯示
            (() => {
                const points = userData.currentPoints || 0;
                document.getElementById('headerPoints').textContent = points.toString();
                UserDataManager.setAuthoritative('points', points, 'firebase');
            })(),
            
            // 更新抽獎券顯示
            (() => {
                const tickets = userData.lotteryTickets || 0;
                document.getElementById('headerLotteryTickets').textContent = tickets.toString();
                UserDataManager.setAuthoritative('lotteryTickets', tickets, 'firebase');
            })(),
            
            // 更新活動列表
            (() => {
                const activities = FirebaseDataManager.getActivities();
                updateActivitiesUI(activities);
            })(),
            
            // 更新商品列表
            (() => {
                const products = FirebaseDataManager.getProducts();
                updateProductsUI(products);
            })(),
            
            // 更新排行榜
            (() => {
                const leaderboard = FirebaseDataManager.getLeaderboard();
                updateLeaderboardUI(leaderboard, profile.userId);
            })(),
            
            // 更新點數歷史
            (() => {
                const pointHistory = FirebaseDataManager.getPointHistory(profile.userId);
                updatePointHistoryUI(pointHistory);
            })(),
            
            // 更新抽獎歷史
            (() => {
                const lotteryHistory = FirebaseDataManager.getLotteryHistory(profile.userId);
                updateLotteryHistoryUI(lotteryHistory);
            })()
        ]);
        performanceLog.steps.uiUpdate = performance.now() - step5Start;
        console.log(`⏱️ UI更新處理: ${performanceLog.steps.uiUpdate.toFixed(2)}ms`);
        
        // 6. 快取所有資料
        const step6Start = performance.now();
        UserDataManager.setAuthoritative('memberLevel', userData.memberLevel || '一般會員', 'firebase');
        UserDataManager.setAuthoritative('totalEarned', userData.totalEarned || 0, 'firebase');
        UserDataManager.setLastUpdate('points', new Date());
        UserDataManager.setLastUpdate('memberLevel', new Date());
        
        // 快取活動狀態（如同原始版本）
        userActivityStatus = {}; // 重置活動狀態，稍後透過寫入操作更新
        performanceLog.steps.cache = performance.now() - step6Start;
        console.log(`⏱️ 資料快取: ${performanceLog.steps.cache.toFixed(2)}ms`);
        
        // 計算總時間
        const totalTime = performance.now() - startTime;
        
        // 詳細性能報告（如同原始版本）
        console.log('🔥 Firebase 一次性載入完成 - 詳細時間統計:');
        console.log(`   📊 總載入時間: ${totalTime.toFixed(2)}ms`);
        console.log(`   🔍 LINE基本資料: ${performanceLog.steps.lineProfile.toFixed(2)}ms (${((performanceLog.steps.lineProfile / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   🎨 基本UI更新: ${performanceLog.steps.basicUI.toFixed(2)}ms (${((performanceLog.steps.basicUI / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   🔥 Firebase資料載入: ${(performanceLog.steps.firebase || 0).toFixed(2)}ms`);
        console.log(`   ✅ 綁定狀態檢查: ${(performanceLog.steps.binding || 0).toFixed(2)}ms (${(((performanceLog.steps.binding || 0) / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   🖼️ UI更新處理: ${(performanceLog.steps.uiUpdate || 0).toFixed(2)}ms (${(((performanceLog.steps.uiUpdate || 0) / totalTime) * 100).toFixed(1)}%)`);
        console.log(`   💾 資料快取: ${(performanceLog.steps.cache || 0).toFixed(2)}ms (${(((performanceLog.steps.cache || 0) / totalTime) * 100).toFixed(1)}%)`);
        
        // 🎯 目標：2秒內載入完成
        if (totalTime < 2000) {
            console.log('🎉 Firebase 載入目標達成！載入速度大幅提升！');
        } else {
            console.log(`⚡ 目前載入時間為 ${totalTime.toFixed(0)}ms，仍可進一步優化`);
        }
        
        // 完成進度條
        ProgressManager.complete();
        
        // 🎯 Firebase 載入成功，啟動輕量級背景更新服務
        startSmartBackgroundUpdates();
        
        return; // 重要：Firebase 成功時不執行後續的 Google Apps Script 載入
        
    } catch (error) {
        console.error('❌ Firebase 載入失敗:', error);
        ProgressManager.hide();
        // 降級到原有方式
        await loadUserProfileImmediate();
    }
}

// 啟動智能背景更新服務
function startSmartBackgroundUpdates() {
    console.log('🎯 啟動輕量級背景更新服務...');
    SmartBackgroundUpdate.start();
    console.log('✅ 智能背景更新服務已啟動');
}

// 🚀 使用 Firebase 已載入的數據填充頁面
function loadPageFromFirebaseData(pageId) {
    console.log(`🎯 使用 Firebase 數據載入頁面: ${pageId}`);
    
    switch (pageId) {
        case 'earnPage':
            // 活動頁面 - 使用 Firebase 活動數據
            const activities = FirebaseDataManager.getActivities();
            if (activities && activities.length > 0) {
                updateActivitiesUI(activities);
                console.log(`✅ 活動頁面已使用 Firebase 數據載入 (${activities.length} 筆活動)`);
            } else {
                console.log(`⚠️ Firebase 活動數據為空或未載入`);
            }
            break;
            
        case 'productsPage':
            // 商品頁面 - 使用 Firebase 商品數據
            const products = FirebaseDataManager.getProducts();
            if (products && products.length > 0) {
                displayProducts(products);
                console.log(`✅ 商品頁面已使用 Firebase 數據載入 (${products.length} 筆商品)`);
            } else {
                console.log(`⚠️ Firebase 商品數據為空或未載入`);
            }
            break;
            
        case 'lotteryPage':
            // 抽獎頁面 - 使用 Firebase 抽獎數據
            const prizes = FirebaseDataManager.getLotteryPrizes();
            if (prizes) {
                displayLotteryPrizes(prizes);
                preGenerateLotteryGrid(prizes);
                generateSimpleLotteryGrid(prizes);
                console.log(`✅ 抽獎頁面已使用 Firebase 數據載入`);
            }
            break;
            
        case 'leaderboardPage':
            // 排行榜頁面 - 使用 Firebase 排行榜數據
            const leaderboard = FirebaseDataManager.getLeaderboard();
            if (leaderboard && leaderboard.length > 0) {
                updateLeaderboardUI(leaderboard);
                console.log(`✅ 排行榜頁面已使用 Firebase 數據載入 (${leaderboard.length} 筆)`);
            }
            break;
            
        case 'recordsPage':
            // 記錄頁面 - 使用 Firebase 歷史數據
            if (currentUser && currentUser.userId) {
                const pointHistory = FirebaseDataManager.getPointHistory(currentUser.userId);
                const lotteryHistory = FirebaseDataManager.getLotteryHistory(currentUser.userId);
                
                if (pointHistory) {
                    updatePointHistoryUI(pointHistory);
                    console.log(`✅ 點數記錄已使用 Firebase 數據載入`);
                }
                if (lotteryHistory) {
                    updateLotteryHistoryUI(lotteryHistory);
                    console.log(`✅ 抽獎記錄已使用 Firebase 數據載入`);
                }
            }
            break;
            
        case 'exchangedPage':
            // 已兌換商品頁面 - 使用 Firebase 已兌換商品數據
            if (currentUser && currentUser.userId) {
                const exchangedProducts = FirebaseDataManager.getExchangedProducts(currentUser.userId);
                console.log(`🔍 Firebase 已兌換商品數據:`, exchangedProducts);
                if (exchangedProducts && exchangedProducts.length > 0) {
                    displayExchangedProducts(exchangedProducts);
                    console.log(`✅ 已兌換商品頁面已使用 Firebase 數據載入 (${exchangedProducts.length} 筆)`);
                } else {
                    console.log(`⚠️ Firebase 已兌換商品數據為空`);
                }
            } else {
                console.log(`⚠️ currentUser 未定義`);
            }
            break;
            
        default:
            console.log(`⚡ 頁面 ${pageId} 無需額外載入`);
    }
}

// 立即顯示用戶基本資料 - 最快速度
async function loadUserProfileImmediate() {
    const startTime = performance.now();
    const performanceLog = {
        total: 0,
        steps: {}
    };
    
    try {
        console.log('⚡ 立即載入用戶基本資料...');
        
        // 1. 立即獲取並顯示LINE基本資料
        const step1Start = performance.now();
        const profile = await liff.getProfile();
        currentUser = profile;
        performanceLog.steps.lineProfileFetch = performance.now() - step1Start;
        console.log(`⏱️ LINE資料獲取: ${performanceLog.steps.lineProfileFetch.toFixed(2)}ms`);
        console.log('✅ LINE資料獲取完成:', profile.displayName);
        
        // 2. 立即更新UI顯示
        const step2Start = performance.now();
        document.getElementById('userName').textContent = profile.displayName;
        document.getElementById('userAvatar').textContent = profile.displayName.charAt(0);
        performanceLog.steps.profileUIUpdate = performance.now() - step2Start;
        
        // 設定頭像
        if (profile.pictureUrl) {
            const avatar = document.getElementById('userAvatar');
            avatar.style.backgroundImage = `url(${profile.pictureUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.textContent = '';
        }
        console.log(`⏱️ 基本UI更新: ${performanceLog.steps.profileUIUpdate.toFixed(2)}ms`);
        
        // 3. 立即載入電話和會員等級資料
        const step3Start = performance.now();
        try {
            // 獲取綁定資料
            const bindingResult = await APIManager.request('checkBinding');
            
            // 更新電話顯示
            if (bindingResult.success && bindingResult.isBound) {
                const phoneField = bindingResult.userData?.customerInputPhone || '';
            let displayPhone = '未設定電話';
            
            if (phoneField) {
                let phoneStr = String(phoneField).trim();
                if (phoneStr.length === 9 && /^\d{9}$/.test(phoneStr)) {
                    displayPhone = '0' + phoneStr;
                } else if (phoneStr.length === 10 && phoneStr.startsWith('0') && /^\d{10}$/.test(phoneStr)) {
                    displayPhone = phoneStr;
                } else if (phoneStr) {
                    displayPhone = phoneStr;
                }
            }
            
            document.getElementById('userPhone').textContent = displayPhone;
            
            // 更新會員等級顯示
                const memberLevel = bindingResult.userData?.memberLevel || '一般會員';
                const levelStyle = getMemberLevelStyle(memberLevel);
                const accountStatusElement = document.getElementById('accountStatus');
                if (accountStatusElement) {
                    accountStatusElement.textContent = levelStyle.levelName;
                    accountStatusElement.className = `account-status-large ${levelStyle.className}`;
                }
            } else {
                document.getElementById('userPhone').textContent = '未綁定';
                document.getElementById('accountStatus').textContent = '一般會員';
                document.getElementById('accountStatus').className = 'account-status-large normal';
            }
            
        } catch (error) {
            console.error('載入電話和會員等級失敗:', error);
            document.getElementById('userPhone').textContent = '載入失敗';
            document.getElementById('accountStatus').textContent = '載入失敗';
        }
        performanceLog.steps.bindingDataFetch = performance.now() - step3Start;
        console.log(`⏱️ 綁定資料載入: ${performanceLog.steps.bindingDataFetch.toFixed(2)}ms`);
        
        // 4. 檢查是否有快取資料可以立即顯示其他資訊
        const step4Start = performance.now();
        const cachedPoints = cache.getStale('pointsResult');
        const cachedExchanged = cache.getStale('exchangedResult');
        const cachedTickets = cache.getStale('lotteryTickets');
        
        // 顯示快取的點數或載入中
        if (cachedPoints && cachedPoints.success) {
            let points = 0;
            if (cachedPoints.data && typeof cachedPoints.data.currentPoints !== 'undefined') {
                points = cachedPoints.data.currentPoints;
            } else if (typeof cachedPoints.points !== 'undefined') {
                points = cachedPoints.points;
            } else if (typeof cachedPoints.data !== 'undefined') {
                points = cachedPoints.data;
            }
            document.getElementById('headerPoints').textContent = points.toString();
        } else {
            document.getElementById('headerPoints').textContent = '...';
        }
        
        // 顯示快取的抽獎券或載入中
        if (cachedTickets && typeof cachedTickets === 'number') {
            document.getElementById('headerLotteryTickets').textContent = cachedTickets.toString();
        } else {
            document.getElementById('headerLotteryTickets').textContent = '...';
        }
        
        // 顯示快取的兌換商品數量或載入中
        if (cachedExchanged && cachedExchanged.success) {
            const now = new Date();
            const unusedCount = cachedExchanged.data.filter(product => {
                const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                return product.status === '未使用' && !isExpired;
            }).length;
            // 使用權威數據機制
            UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, 'loadUserProfileImmediate');
        } else {
            // 使用權威數據機制設置載入中狀態
            UserDataManager.updateUI('unusedProductsCount', '...');
        }
        performanceLog.steps.cacheDisplay = performance.now() - step4Start;
        console.log(`⏱️ 快取資料顯示: ${performanceLog.steps.cacheDisplay.toFixed(2)}ms`);
        
        performanceLog.total = performance.now() - startTime;
        
        // 生成性能分析報告
        console.log('📊 立即載入性能分析報告:');
        console.log('================================');
        console.log(`📈 總載入時間: ${performanceLog.total.toFixed(2)}ms`);
        console.log('⚡ 各環節耗時:');
        
        const sortedSteps = Object.entries(performanceLog.steps)
            .sort((a, b) => b[1] - a[1])
            .map(([name, time], index) => {
                const percentage = ((time / performanceLog.total) * 100).toFixed(1);
                const icon = index === 0 ? '🔥' : index === 1 ? '⚠️' : '✅';
                return `${icon} ${getImmediateStepDisplayName(name)}: ${time.toFixed(2)}ms (${percentage}%)`;
            });
            
        sortedSteps.forEach(step => console.log(`  ${step}`));
        console.log('================================');
        console.log(`✅ 基本UI更新完成 (${performanceLog.total.toFixed(2)}ms)`);
        
        // 🎯 啟動輕量級背景更新服務
        startSmartBackgroundUpdates();
        
    } catch (error) {
        console.error('❌ 立即載入用戶資料失敗:', error);
        // 如果立即載入失敗，回退到原有方式
        await loadUserProfileOptimized();
    }
}

// 優化的用戶資料載入 - 一次性預載入所有資料
async function loadUserProfileOptimized() {
    const startTime = performance.now();
    const performanceLog = {
        total: 0,
        steps: {}
    };
    
    try {
        console.log('開始一次性預載入所有資料...');
        
        // 1. 並行請求所有需要的資料
        const step1Start = performance.now();
        const [
            pointsResult,
            exchangedResult,
            lotteryResult,
            productsResult,
            prizesResult,
            activitiesResult,
            leaderboardResult,
            pointHistoryResult,
            lotteryHistoryResult
        ] = await Promise.all([
            APIManager.request('getUserPoints'),
            APIManager.request('getExchangedProducts'),
            APIManager.request('getLotteryTickets'),
            APIManager.request('getProducts'),
            APIManager.request('getLotteryPrizes'),
            APIManager.request('getActivities'),
            APIManager.request('getLeaderboard'),
            APIManager.request('getPointHistory'),
            APIManager.request('getLotteryHistory')
        ]);
        performanceLog.steps.dataFetchAll = performance.now() - step1Start;
        console.log(`⏱️ 並行資料載入: ${performanceLog.steps.dataFetchAll.toFixed(2)}ms`);

        // 2. 快取所有資料
        const step2Start = performance.now();
        // 2.1 靜態資料 - 長時間快取
        if(productsResult.success) {
            SmartCacheManager.smartSet('products', productsResult.data, 'static', 3600000); // 1小時
        }
        if(prizesResult.success) {
            SmartCacheManager.smartSet('lotteryPrizes', prizesResult.data, 'static', 3600000);
        }
        if(activitiesResult.success) {
            SmartCacheManager.smartSet('activities', activitiesResult.data, 'static', 3600000);
        }
        if(leaderboardResult.success) {
            SmartCacheManager.smartSet('leaderboard', leaderboardResult.data, 'static', 3600000);
        }
        if(pointHistoryResult.success) {
            SmartCacheManager.smartSet('pointHistory', pointHistoryResult.data, 'static', 3600000);
        }
        if(lotteryHistoryResult.success) {
            SmartCacheManager.smartSet('lotteryHistory', lotteryHistoryResult.data, 'static', 3600000);
        }

        // 2.2 關鍵資料 - 短時間快取
        if(pointsResult.success) {
            SmartCacheManager.smartSet('userPoints', pointsResult.data, 'critical', 30000); // 30秒
        }
        if(lotteryResult.success) {
            SmartCacheManager.smartSet('lotteryTickets', lotteryResult.data, 'critical', 30000);
        }
        if(exchangedResult.success) {
            SmartCacheManager.smartSet('exchangedResult', exchangedResult.data, 'critical', 30000);
        }
        performanceLog.steps.dataCaching = performance.now() - step2Start;
        console.log(`⏱️ 資料快取: ${performanceLog.steps.dataCaching.toFixed(2)}ms`);

        // 2.3 更新用戶資料顯示
        const step2_3Start = performance.now();
        if(pointsResult.success) {
            UserDataManager.safeUpdate('points', pointsResult.data.currentPoints || 0, 'loadUserProfileOptimized');
        }
        if(lotteryResult.success) {
            UserDataManager.safeUpdate('lotteryTickets', lotteryResult.data.currentTickets || 0, 'loadUserProfileOptimized');
        }
        performanceLog.steps.userDataUpdate = performance.now() - step2_3Start;
        console.log(`⏱️ 用戶資料更新: ${performanceLog.steps.userDataUpdate.toFixed(2)}ms`);

        // 3. 預渲染所有頁面內容
        const step3Start = performance.now();
        if(productsResult.success) {
            const productsContainer = document.getElementById('productsList');
            if(productsContainer) {
                displayProducts(productsResult.data);
            }
        }
        if(exchangedResult.success) {
            const unusedList = document.getElementById('unusedProductsList');
            const usedList = document.getElementById('usedProductsList');
            if(unusedList && usedList) {
                displayExchangedProducts(exchangedResult.data);
            }
        }
        if(pointHistoryResult.success) {
            const historyList = document.getElementById('historyList');
            if(historyList) {
                displayPointHistory(pointHistoryResult.data);
            }
        }
        if(lotteryHistoryResult.success) {
            const lotteryHistoryList = document.getElementById('lotteryHistoryList');
            if(lotteryHistoryList) {
                displayLotteryHistory(lotteryHistoryResult.data.records, lotteryHistoryResult.data.currentTickets);
            }
        }
        if(leaderboardResult.success) {
            const leaderboardList = document.getElementById('leaderboardList');
            if(leaderboardList) {
                displayLeaderboard(leaderboardResult.data);
            }
        }
        performanceLog.steps.uiRenderAll = performance.now() - step3Start;
        console.log(`⏱️ UI預渲染: ${performanceLog.steps.uiRenderAll.toFixed(2)}ms`);

        // 4. 設置智能背景更新
        const step4Start = performance.now();
        // 4.1 關鍵數據更新 - 每45秒
        setInterval(async () => {
            const [pointsRes, ticketsRes, exchangedRes] = await Promise.all([
                APIManager.getUserPoints(),
                APIManager.getLotteryTickets(),
                APIManager.getExchangedProducts()
            ]);
            
            if(pointsRes.success) {
                SmartCacheManager.smartSet('userPoints', pointsRes.data, 'critical', 30000);
                UserDataManager.safeUpdate('points', pointsRes.data.currentPoints || 0, 'background-update');
            }
            if(ticketsRes.success) {
                SmartCacheManager.smartSet('lotteryTickets', ticketsRes.data, 'critical', 30000);
                UserDataManager.safeUpdate('lotteryTickets', ticketsRes.data.currentTickets || 0, 'background-update');
            }
            if(exchangedRes.success) {
                SmartCacheManager.smartSet('exchangedResult', exchangedRes.data, 'critical', 30000);
            const now = new Date();
                const unusedCount = exchangedRes.data.filter(product => {
                const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                    const isUseExpired = product.useExpirationDate && new Date(product.useExpirationDate) < now;
                    return product.status === '未使用' && !isExpired && !isUseExpired && !product.isExpired;
            }).length;
                UserDataManager.safeUpdate('unusedProductsCount', unusedCount, 'background-update');
            }
        }, 45000);

        // 4.2 半靜態數據更新 - 每30分鐘
        setInterval(async () => {
            const [productsRes, prizesRes] = await Promise.all([
                APIManager.getProducts(),
                APIManager.getLotteryPrizes()
            ]);
            
            if(productsRes.success) {
                SmartCacheManager.smartSet('products', productsRes.data, 'semi_static', 1800000);
            }
            if(prizesRes.success) {
                SmartCacheManager.smartSet('lotteryPrizes', prizesRes.data, 'semi_static', 1800000);
            }
        }, 1800000);

        // 4.3 靜態數據更新 - 每1小時
        setInterval(async () => {
            const [activitiesRes, leaderboardRes, pointHistoryRes, lotteryHistoryRes] = await Promise.all([
                APIManager.getActivities(),
                APIManager.getLeaderboard(),
                APIManager.getPointHistory(),
                APIManager.getLotteryHistory()
            ]);
            
            if(activitiesRes.success) {
                SmartCacheManager.smartSet('activities', activitiesRes.data, 'static', 3600000);
            }
            if(leaderboardRes.success) {
                SmartCacheManager.smartSet('leaderboard', leaderboardRes.data, 'static', 3600000);
            }
            if(pointHistoryRes.success) {
                SmartCacheManager.smartSet('pointHistory', pointHistoryRes.data, 'static', 3600000);
            }
            if(lotteryHistoryRes.success) {
                SmartCacheManager.smartSet('lotteryHistory', lotteryHistoryRes.data, 'static', 3600000);
            }
        }, 3600000);
        
        performanceLog.steps.backgroundSetup = performance.now() - step4Start;
        console.log(`⏱️ 背景服務設置: ${performanceLog.steps.backgroundSetup.toFixed(2)}ms`);
        
        performanceLog.total = performance.now() - startTime;
        
        // 生成性能分析報告
        console.log('📊 優化載入性能分析報告:');
        console.log('================================');
        console.log(`📈 總載入時間: ${performanceLog.total.toFixed(2)}ms`);
        console.log('⚡ 各環節耗時:');
        
        const sortedSteps = Object.entries(performanceLog.steps)
            .sort((a, b) => b[1] - a[1])
            .map(([name, time], index) => {
                const percentage = ((time / performanceLog.total) * 100).toFixed(1);
                const icon = index === 0 ? '🔥' : index === 1 ? '⚠️' : '✅';
                return `${icon} ${getOptimizedStepDisplayName(name)}: ${time.toFixed(2)}ms (${percentage}%)`;
            });
            
        sortedSteps.forEach(step => console.log(`  ${step}`));
        console.log('================================');
        console.log(`✅ 完整用戶資料載入完成 (${performanceLog.total.toFixed(2)}ms)`);
        
    } catch (error) {
        console.error('載入用戶資料失敗:', error);
        showAlert('載入用戶資料失敗，請重新整理頁面', 'danger');
    }
}

// 保留原有函數以供向後相容
async function loadUserProfile() {
    return await loadUserProfileOptimized();
}

// 背景預載入所有頁面資料
async function preloadAllPageData() {
    if (!currentUser || !currentUser.userId) {
        return;
    }
    
    try {
        console.log('開始預載入所有頁面資料...');
        
        // 1. 並行請求所有頁面資料
        const [
            activitiesResult,
            leaderboardResult,
            pointHistoryResult,
            lotteryHistoryResult,
            productsResult,
            prizesResult,
            pointsResult,
            lotteryTicketsResult,
            exchangedResult
        ] = await Promise.all([
            APIManager.request('getActivities'),
            APIManager.request('getLeaderboard'),
            APIManager.request('getPointHistory'),
            APIManager.request('getLotteryHistory'),
            APIManager.request('getProducts'),
            APIManager.request('getLotteryPrizes'),
            APIManager.request('getUserPoints'),
            APIManager.request('getLotteryTickets'),
            APIManager.request('getExchangedProducts')
        ]);

        // 2. 快取所有資料
        // 2.1 靜態資料 - 長時間快取
        if(activitiesResult.success) {
            SmartCacheManager.smartSet('activities', activitiesResult.data, 'static', 3600000);
            // 預渲染活動列表
            const earnActivitiesList = document.getElementById('earnActivitiesList');
            if(earnActivitiesList) {
                displayActivities(activitiesResult.data);
            }
        }
        if(leaderboardResult.success) {
            SmartCacheManager.smartSet('leaderboard', leaderboardResult.data, 'static', 3600000);
            // 預渲染排行榜
            const leaderboardList = document.getElementById('leaderboardList');
            if(leaderboardList) {
                displayLeaderboard(leaderboardResult.data);
            }
        }
        if(pointHistoryResult.success) {
            SmartCacheManager.smartSet('pointHistory', pointHistoryResult.data, 'static', 3600000);
        }
        if(lotteryHistoryResult.success) {
            SmartCacheManager.smartSet('lotteryHistory', lotteryHistoryResult.data, 'static', 3600000);
        }

        // 2.2 半靜態資料 - 中等時間快取
        if(productsResult.success) {
            SmartCacheManager.smartSet('products', productsResult.data, 'semi_static', 1800000);
            // 預渲染商品列表
            const productsList = document.getElementById('productsList');
            if(productsList) {
                displayProducts(productsResult.data);
            }
        }
        if(prizesResult.success) {
            SmartCacheManager.smartSet('lotteryPrizes', prizesResult.data, 'semi_static', 1800000);
        }

        // 2.3 關鍵資料 - 短時間快取
        if(pointsResult.success) {
            SmartCacheManager.smartSet('userPoints', pointsResult.data, 'critical', 30000);
            UserDataManager.safeUpdate('points', pointsResult.data.currentPoints || 0, 'preloadAllPageData');
        }
        if(lotteryTicketsResult.success) {
            SmartCacheManager.smartSet('lotteryTickets', lotteryTicketsResult.data, 'critical', 30000);
            UserDataManager.safeUpdate('lotteryTickets', lotteryTicketsResult.data.currentTickets || 0, 'preloadAllPageData');
        }
        if(exchangedResult.success) {
            SmartCacheManager.smartSet('exchangedResult', exchangedResult.data, 'critical', 30000);
            // 預渲染已兌換商品
            const unusedList = document.getElementById('unusedProductsList');
            const usedList = document.getElementById('usedProductsList');
            if(unusedList && usedList) {
                displayExchangedProducts(exchangedResult.data);
            }
        }

        console.log('✅ 所有頁面資料預載入完成');
        
    } catch (error) {
        console.error('❌ 預載入資料失敗:', error);
    }
}

// 載入用戶點數 - 優化版本
async function loadUserPoints() {
    if (!currentUser || !currentUser.userId) {
        return;
    }
    
    // 先檢查快取
    const cachedResult = cache.get('pointsResult');
    if (cachedResult && cachedResult.success) {
        let points = 0;
        if (cachedResult.data && typeof cachedResult.data.currentPoints !== 'undefined') {
            points = cachedResult.data.currentPoints;
        } else if (typeof cachedResult.points !== 'undefined') {
            points = cachedResult.points;
        } else if (typeof cachedResult.data !== 'undefined') {
            points = cachedResult.data;
        }
        UserDataManager.safeUpdate('points', points, 'loadUserPoints快取');
        return;
    }
    
    try {
        const result = await APIManager.getUserPoints();
        
        if (result.success) {
            // 智能快取結果
            SmartCacheManager.smartSet('pointsResult', result, 'userPoints');
            
            // 處理不同的 API 回應格式
            let points = 0;
            if (result.data && typeof result.data.currentPoints !== 'undefined') {
                points = result.data.currentPoints;
            } else if (typeof result.points !== 'undefined') {
                points = result.points;
            } else if (typeof result.data !== 'undefined') {
                points = result.data;
            }
            
            UserDataManager.safeUpdate('points', points, 'loadUserPoints API');
        } else {
            UserDataManager.safeUpdate('points', 0, 'loadUserPoints錯誤');
        }
    } catch (error) {
        UserDataManager.safeUpdate('points', 0, 'loadUserPoints異常');
    }
}

// 統一更新點數顯示 - 已廢棄，請使用 UserDataManager.updateUI('points', value)
function updatePointsDisplay(points) {
    console.warn('⚠️ updatePointsDisplay 已廢棄，請使用 UserDataManager.updateUI 或 UserDataManager.safeUpdate');
    
    // 自動轉發到統一管理器
    UserDataManager.updateUI('points', points);
}

// 載入待使用商品數量 - 優化版本
async function loadUnusedProductsCount() {
    if (!currentUser || !currentUser.userId) {
        return;
    }
    
    // 先檢查快取
    const cachedResult = cache.get('exchangedResult');
    if (cachedResult && cachedResult.success) {
        const now = new Date();
        const unusedCount = cachedResult.data.filter(product => {
            const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
            return product.status === '未使用' && !isExpired;
        }).length;
        // 使用權威數據機制
        UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, 'loadUnusedProductsCount-cache');
        return;
    }
    
    try {
        const result = await APIManager.getExchangedProducts();
        
        if (result.success) {
            // 智能快取結果
            CacheManager.smartSet('exchangedResult', result, 'exchangedProducts');
            
            // 計算待使用商品數量（未使用且未過期）
            const now = new Date();
            const unusedCount = result.data.filter(product => {
                const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                return product.status === '未使用' && !isExpired;
            }).length;
            
            // 使用權威數據機制
            UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, 'loadUnusedProductsCount-API');
        } else {
            UserDataManager.setAuthoritative('unusedProductsCount', 0, 'loadUnusedProductsCount-API-failed');
        }
    } catch (error) {
        console.error('載入待使用商品數量失敗:', error);
        UserDataManager.setAuthoritative('unusedProductsCount', 0, 'loadUnusedProductsCount-error');
    }
}

// 頁面切換 - 整合智能更新系統
function showPage(pageId) {
    // 隱藏所有頁面
    document.querySelectorAll('.page-content').forEach(page => page.style.display = 'none');
    document.getElementById('mainPage').style.display = 'none';
    
    // 顯示目標頁面
    if (pageId === 'mainPage') {
        document.getElementById('mainPage').style.display = 'block';
    } else {
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
            
            // 🚀 優先使用 Firebase 已載入的數據，無需額外 API 請求
            loadPageFromFirebaseData(pageId);
        }
    }

    // 🚀 舊的快取邏輯已被 Firebase 即時數據取代
    // Firebase 數據已在初始載入時完成，頁面切換時直接使用，無需額外 API 請求
    
    /*
    // === 舊的快取邏輯 (已停用) ===
    switch (pageId) {
        case 'productsPage':
            const productsData = SmartCacheManager.smartGet('products', 'static');
            const quantityData = SmartCacheManager.smartGet('productQuantity', 'critical');
            if (productsData) {
                // 合併基本資料和數量資料
                const mergedProducts = productsData.map(product => {
                    const quantity = quantityData?.find(q => q.id === product.id);
                    return {
                        ...product,
                        remainingQuantity: quantity?.remainingQuantity ?? product.remainingQuantity
                    };
                });
                displayProducts(mergedProducts);
            }
            break;
                
        case 'exchangedPage':
            const exchangedData = cache.get('exchangedResult');
            if (exchangedData?.success) {
                displayExchangedProducts(exchangedData.data);
            }
            break;
                
        case 'lotteryPage':
            const prizesData = SmartCacheManager.smartGet('lotteryPrizes', 'static');
            const prizeQuantityData = SmartCacheManager.smartGet('lotteryQuantity', 'critical');
            if (prizesData) {
                // 合併基本資料和數量資料
                const mergedPrizes = prizesData.map(prize => {
                    const quantity = prizeQuantityData?.find(q => q.id === prize.id);
                    return {
                        ...prize,
                        remainingQuantity: quantity?.remainingQuantity ?? prize.remainingQuantity
                    };
                });
                displayLotteryPrizes(mergedPrizes);
                generateSimpleLotteryGrid(mergedPrizes);
            }
            break;
                
        case 'earnPage':
            const activitiesData = SmartCacheManager.smartGet('activities', 'static');
            const activityStatus = SmartCacheManager.smartGet('userActivityStatus', 'realtime');
            if (activitiesData && activityStatus) {
                userActivityStatus = activityStatus;
                displayActivities(activitiesData);
            }
            break;
                
        case 'leaderboardPage':
            const leaderboardData = SmartCacheManager.smartGet('leaderboard', 'static');
            if (leaderboardData) {
                displayLeaderboard(leaderboardData.leaderboard, leaderboardData.myRank);
            }
            break;
    }
    */

    // 更新當前頁面ID
    currentPageId = pageId;
}

// 載入商品列表 - 優化版本
async function loadProducts() {
    const productsList = document.getElementById('productsList');
    
    // 🚀 使用智能快取檢查商品基本資料
    const cachedProducts = SmartCacheManager.smartGet('products', 'static');
    if (cachedProducts) {
        console.log('✅ 使用商品基本資料快取，立即顯示');
        displayProducts(cachedProducts);
        
        // 在背景更新商品數量
        try {
            const response = await fetch(`${API_BASE_URL}?action=getProducts&accessToken=${liff.getAccessToken()}`);
            const result = await response.json();
            
            if (result.success) {
                // 只更新商品數量相關資訊
                const updatedProducts = cachedProducts.map(cachedProduct => {
                    const updatedProduct = result.data.find(p => p.id === cachedProduct.id);
                    if (updatedProduct) {
                        return {
                            ...cachedProduct,
                            remainingQuantity: updatedProduct.remainingQuantity,
                            totalQuantity: updatedProduct.totalQuantity
                        };
                    }
                    return cachedProduct;
                });
                
                // 更新快取和顯示
                SmartCacheManager.smartSet('productQuantity', updatedProducts, 'critical');
                displayProducts(updatedProducts);
            }
        } catch (error) {
            console.warn('背景更新商品數量失敗:', error);
        }
        return;
    }
    
    // 沒有快取時才顯示載入畫面
    productsList.innerHTML = `
        <div class="loading">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">載入中...</span>
            </div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}?action=getProducts&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            // 分別快取商品基本資料和數量資訊
            SmartCacheManager.smartSet('products', result.data, 'static');
            SmartCacheManager.smartSet('productQuantity', result.data, 'critical');
            displayProducts(result.data);
        } else {
            productsList.innerHTML = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>載入失敗</h5>
                    <p>${result.error || '載入商品失敗'}</p>
                    <button class="btn btn-primary" onclick="loadProducts()">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('載入商品失敗:', error);
        productsList.innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>網路錯誤</h5>
                <p>無法連接到伺服器，請檢查網路連線</p>
                <button class="btn btn-primary" onclick="loadProducts()">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
    }
}

// 載入點數異動紀錄 - 背景更新優化版本
async function loadPointHistoryOptimized(forceUpdate = false) {
    const historyList = document.getElementById('historyList');
    
    // 檢查快取，優先顯示快取資料
    const cachedHistory = cache.get('pointHistory');
    if (cachedHistory && !forceUpdate) {
        console.log('✅ 使用點數歷史快取資料，立即顯示');
        displayPointHistory(cachedHistory);
        UpdateTimeManager.updateTimeDisplay('pointHistory', 'recordsLastUpdateTime');
        return;
    }
    
    // 如果是強制更新，顯示載入動畫
    if (forceUpdate) {
        const refreshBtn = document.getElementById('recordsManualRefreshBtn');
        if (refreshBtn) {
            refreshBtn.classList.add('refreshing');
            refreshBtn.disabled = true;
        }
        document.getElementById('recordsLastUpdateTime').textContent = '更新中...';
    }
    
    // 沒有快取時才顯示載入畫面
    if (!cachedHistory) {
        historyList.innerHTML = `
            <div class="loading">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
            </div>
        `;
        document.getElementById('recordsLastUpdateTime').textContent = '載入中...';
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}?action=getPointHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            // 快取歷史資料
            cache.set('pointHistory', result.data, 7200000); // 靜態模式：2小時快取
            UpdateTimeManager.saveUpdateTime('pointHistory');
            displayPointHistory(result.data);
            UpdateTimeManager.updateTimeDisplay('pointHistory', 'recordsLastUpdateTime');
            
            if (forceUpdate) {
                showAlert('點數記錄已更新', 'success');
            }
        } else {
            historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有異動紀錄</div>';
            document.getElementById('recordsLastUpdateTime').textContent = '載入失敗';
        }
    } catch (error) {
        console.error('載入異動紀錄失敗:', error);
        historyList.innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>載入失敗</h5>
                <p>無法載入點數紀錄，請稍後再試</p>
                <button class="btn btn-primary" onclick="loadPointHistoryOptimized(true)">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
        document.getElementById('recordsLastUpdateTime').textContent = '載入失敗';
    } finally {
        // 移除載入動畫
        if (forceUpdate) {
            const refreshBtn = document.getElementById('recordsManualRefreshBtn');
            if (refreshBtn) {
                refreshBtn.classList.remove('refreshing');
                refreshBtn.disabled = false;
            }
        }
    }
}

// 保留原有函數以兼容性
async function loadPointHistory() {
    await loadPointHistoryOptimized();
}

// ========== 手動更新函數 ==========

// 手動更新記錄 - 統一更新所有記錄（靜態頁面專用）
async function manualRefreshRecords() {
    console.log('🔄 手動更新所有記錄（靜態模式）');
    
    const refreshBtn = document.getElementById('recordsManualRefreshBtn');
    if (refreshBtn) {
        refreshBtn.classList.add('refreshing');
        refreshBtn.disabled = true;
    }
    
    try {
        // 同時更新點數記錄和抽獎記錄
        const [pointsResponse, lotteryResponse] = await Promise.all([
            fetch(`${API_BASE_URL}?action=getPointHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`),
            fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`)
        ]);
        
        const [pointsResult, lotteryResult] = await Promise.all([
            pointsResponse.json(),
            lotteryResponse.json()
        ]);
        
        let hasUpdate = false;
        
        if (pointsResult.success) {
            cache.set('pointHistory', pointsResult.data, 7200000); // 靜態模式：2小時快取
            displayPointHistory(pointsResult.data);
            hasUpdate = true;
        }
        
        if (lotteryResult.success) {
            cache.set('lotteryHistory', lotteryResult.data, 7200000); // 靜態模式：2小時快取
            displayLotteryHistory(lotteryResult.data.records, lotteryResult.data.currentTickets);
            hasUpdate = true;
        }
        
        if (hasUpdate) {
            // 🔥 統一更新時間：兩個記錄區共用同一個更新時間
            UpdateTimeManager.saveUpdateTime('pointHistory'); // 使用 pointHistory 作為統一時間
            UpdateTimeManager.saveUpdateTime('lotteryHistory'); // 保持一致
            
            // 更新顯示時間（只顯示統一時間）
            const updateTime = UpdateTimeManager.getTimeAgo('pointHistory');
            const lastUpdateElement = document.getElementById('recordsLastUpdateTime');
            if (lastUpdateElement && updateTime) {
                lastUpdateElement.textContent = `${updateTime}`;
            }
            
            showAlert('記錄已更新', 'success');
        }
        
    } catch (error) {
        console.error('手動更新記錄失敗:', error);
        showAlert('更新失敗，請稍後再試', 'danger');
    } finally {
        if (refreshBtn) {
            refreshBtn.classList.remove('refreshing');
            refreshBtn.disabled = false;
        }
    }
}

// 手動更新排行榜（靜態頁面專用）
async function manualRefreshLeaderboard() {
    console.log('🔄 手動更新排行榜（靜態模式）');
    const result = await loadLeaderboard(true);
    
    // 更新時間顯示
    if (result !== false) {
        const updateTime = UpdateTimeManager.getTimeAgo('leaderboard');
        const lastUpdateElement = document.getElementById('leaderboardLastUpdateTime');
        if (lastUpdateElement && updateTime) {
            lastUpdateElement.textContent = `${updateTime}`;
        }
    }
}

// 載入抽獎記錄 - 背景更新優化版本
async function loadLotteryHistoryOptimized(forceUpdate = false) {
    const lotteryHistoryList = document.getElementById('lotteryHistoryList');
    
    // 檢查快取，優先顯示快取資料
    const cachedHistory = cache.get('lotteryHistory');
    if (cachedHistory && !forceUpdate) {
        console.log('✅ 使用抽獎歷史快取資料，立即顯示');
        displayLotteryHistory(cachedHistory.records, cachedHistory.currentTickets);
        UpdateTimeManager.updateTimeDisplay('lotteryHistory', 'recordsLastUpdateTime');
        return;
    }
    
    // 如果是強制更新，顯示載入動畫
    if (forceUpdate) {
        const refreshBtn = document.getElementById('recordsManualRefreshBtn');
        if (refreshBtn) {
            refreshBtn.classList.add('refreshing');
            refreshBtn.disabled = true;
        }
        document.getElementById('recordsLastUpdateTime').textContent = '更新中...';
    }
    
    // 沒有快取時才顯示載入畫面
    if (!cachedHistory) {
        lotteryHistoryList.innerHTML = `
            <div class="loading">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
            </div>
        `;
        document.getElementById('recordsLastUpdateTime').textContent = '載入中...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            cache.set('lotteryHistory', result.data, 7200000); // 靜態模式：2小時快取
            UpdateTimeManager.saveUpdateTime('lotteryHistory');
            displayLotteryHistory(result.data.records, result.data.currentTickets);
            UpdateTimeManager.updateTimeDisplay('lotteryHistory', 'recordsLastUpdateTime');
            
            if (forceUpdate) {
                showAlert('抽獎記錄已更新', 'success');
            }
        } else {
            lotteryHistoryList.innerHTML = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>載入失敗</h5>
                    <p>${result.error || '載入抽獎紀錄失敗'}</p>
                    <button class="btn btn-primary" onclick="loadLotteryHistoryOptimized(true)">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
            document.getElementById('recordsLastUpdateTime').textContent = '載入失敗';
        }
    } catch (error) {
        console.error('載入抽獎紀錄失敗:', error);
        lotteryHistoryList.innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>網路錯誤</h5>
                <p>載入失敗，請稍後再試</p>
                <button class="btn btn-primary" onclick="loadLotteryHistoryOptimized(true)">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
        document.getElementById('recordsLastUpdateTime').textContent = '載入失敗';
    } finally {
        // 移除載入動畫
        if (forceUpdate) {
            const refreshBtn = document.getElementById('recordsManualRefreshBtn');
            if (refreshBtn) {
                refreshBtn.classList.remove('refreshing');
                refreshBtn.disabled = false;
            }
        }
    }
}

// 顯示點數歷史紀錄的輔助函數
function displayPointHistory(historyData) {
    const historyList = document.getElementById('historyList');
    
    if (historyData && historyData.length > 0) {
        // 只顯示最近20筆紀錄
        const recentHistory = historyData.slice(0, 20);
        let html = '';
        
        // 如果有超過20筆記錄，顯示額外說明
        if (historyData.length > 20) {
            html += `
            <div class="text-center mb-3">
                    <small class="text-muted">
                        <i class="bi bi-info-circle"></i> 
                        共 ${historyData.length} 筆記錄，僅顯示最近 20 筆
                </small>
            </div>
        `;
        }
        
        html += recentHistory.map(item => {
            // 根據異動類型設置不同的圖示和顏色
            let icon, typeClass;
            switch (item.type) {
                case '活動參與':
                    icon = 'bi-star-fill';
                    typeClass = 'text-success';
                    break;
                case '商品兌換':
                    icon = 'bi-bag-fill';
                    typeClass = 'text-danger';
                    break;
                case '商品使用':
                    icon = 'bi-check-circle-fill';
                    typeClass = 'text-info';
                    break;
                default:
                    icon = 'bi-arrow-right-circle-fill';
                    typeClass = 'text-primary';
            }

            // 建立詳細資訊
            let details = '';
            if (item.relatedName) {
                details += `<div class="small text-muted">${item.relatedName}</div>`;
            }
            if (item.method) {
                details += `<div class="small text-muted"><i class="bi bi-${item.method === 'QR掃描' ? 'qr-code' : 'hand-index'}-fill"></i> ${item.method}</div>`;
            }

            return `
                <div class="history-item mb-3 p-3 bg-white rounded shadow-sm">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="history-content">
                            <div class="history-type ${typeClass}">
                                <i class="bi ${icon}"></i>
                                ${item.type}
                            </div>
                            <div class="fw-bold mt-1 fs-4">${details}</div>
                            
                            <div class="small text-muted mt-1">${formatDateTime(item.time)}</div>
                        </div>
                        <div class="text-end">
                            <div class="history-points fw-bold ${Number(item.points) >= 0 ? 'text-success' : 'text-danger'}">
                                ${Number(item.points) >= 0 ? '+' : ''}${Number(item.points) || 0}
                            </div>
                            <div class="small text-muted">餘額: ${Number(item.balance) || 0}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        historyList.innerHTML = html;
    } else {
        historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有異動紀錄</div>';
    }
}

// 載入活動列表
async function loadActivities() {
    try {
        const accessToken = liff.getAccessToken();
        const response = await fetch(`${API_BASE_URL}?action=getActivities&userId=${currentUser.userId}&accessToken=${accessToken}`);
        const result = await response.json();
        
        if (result.success) {
            const activitiesList = document.getElementById('earnActivitiesList');
            const activitiesTitle = document.getElementById('activitiesTitle');
            
            if (result.data.length === 0) {
                activitiesTitle.textContent = '目前沒有可參與的活動';
                activitiesList.innerHTML = `
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle"></i> 目前沒有進行中的活動，請稍後再查看。
                    </div>
                `;
                return;
            }
            
            activitiesTitle.textContent = `可參與的活動 (${result.data.length})`;
            
            // 根據結束時間排序活動，越快結束的排在前面
            const sortedActivities = result.data.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
            
            activitiesList.innerHTML = sortedActivities.map(activity => {
                const endTime = new Date(activity.endTime);
                const now = new Date();
                
                // 計算剩餘時間
                const remainingTime = endTime - now;
                const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
                const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                
                // 設置剩餘時間提示
                let timeStatus = '';
                if (days > 0) {
                    timeStatus = `還剩 ${days} 天 ${hours} 小時`;
                } else if (hours > 0) {
                    timeStatus = `還剩 ${hours} 小時`;
        } else {
                    timeStatus = '即將結束';
                }
                
                return `
                    <div class="activity-card">
                        <div class="activity-header">
                            <h5 class="activity-title">${activity.name}</h5>
                            <span class="activity-points">+${activity.points} 點</span>
                        </div>
                        
                        <p class="activity-description">${activity.description}</p>
                        
                        <div class="activity-time">
                            <div class="time-status ${remainingTime < 24 * 60 * 60 * 1000 ? 'urgent' : ''}">
                                <i class="bi bi-clock"></i> ${timeStatus}
                            </div>
                        </div>
                        
                        <div class="activity-footer">
                                                    ${activity.allowButtonClaim ? 
                            `<button class="btn-claim" data-activity-id="${activity.id}" onclick="claimPointsByButton('${activity.id}')">
                                <i class="bi bi-gift"></i> 領取點數
                            </button>` :
                            `<div class="qr-only-notice">
                                <i class="bi bi-qr-code"></i> 僅限 QR Code 掃描
                            </div>`
                        }
                        </div>
                    </div>
                `;
            }).join('');
            
        } else {
            showAlert(result.error || '載入活動失敗', 'danger');
        }
    } catch (error) {
        console.error('載入活動失敗:', error);
        showAlert('網路錯誤，請稍後再試', 'danger');
    }
}

// 載入領取頁面的活動 - 優化版本
async function loadEarnActivities() {
    try {
        const accessToken = liff.getAccessToken();
        let earnActivitiesList = document.getElementById('earnActivitiesList');
        let activitiesTitle = document.getElementById('activitiesTitle');
        
        // 檢查是否有快取的活動和狀態資料
        const cachedActivities = cache.get('activities');
        const cachedStatus = cache.get('userActivityStatus');
        
        if (cachedActivities && cachedStatus) {
            console.log('✅ 使用活動快取資料，立即顯示');
            userActivityStatus = cachedStatus;
            
            // 更新標題顯示活動數量
            if (activitiesTitle) {
                activitiesTitle.textContent = `可領取的活動 (${cachedActivities.length})`;
            }
            
            if (cachedActivities.length > 0) {
                displayActivities(cachedActivities);
            } else {
                earnActivitiesList.innerHTML = '<div class="no-activities">目前沒有可領取的活動</div>';
            }
            return;
        }
        
        // 如果有部分快取，先顯示再更新
        if (cachedActivities) {
            console.log('⚡ 使用部分快取，先顯示活動列表');
            if (activitiesTitle) {
                activitiesTitle.textContent = `可領取的活動 (${cachedActivities.length})`;
            }
            if (cachedActivities.length > 0) {
                displayActivities(cachedActivities);
            }
            // 繼續載入用戶狀態
        } else {
            // 沒有快取時才顯示載入畫面
            earnActivitiesList.innerHTML = `
                <div class="loading">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">載入中...</span>
                    </div>
                </div>
            `;
        }
        
        // 並行載入活動列表和用戶狀態
        const [activitiesResponse, statusResponse] = await Promise.all([
            fetch(`${API_BASE_URL}?action=getActivities&accessToken=${accessToken}`),
            fetch(`${API_BASE_URL}?action=getUserActivityStatus&userId=${currentUser.userId}&accessToken=${accessToken}`)
        ]);
        
        const activitiesResult = await activitiesResponse.json();
        const statusResult = await statusResponse.json();
        
        if (statusResult.success) {
            userActivityStatus = statusResult.data;
            // 快取用戶狀態
            cache.set('userActivityStatus', statusResult.data, 120000); // 2分鐘快取

        } else {
            console.error('載入用戶狀態失敗:', statusResult.error);
        }
        
        if (!activitiesResult.success) {
            console.error('載入活動失敗:', activitiesResult.error);
            earnActivitiesList.innerHTML = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>網路錯誤</h5>
                    <p>無法連接到伺服器，請檢查網路連線</p>
                    <button class="btn btn-primary mt-2" onclick="refreshEarnPage()">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
            return;
        }
        
        const activities = activitiesResult.data || [];
        // 快取活動資料
        cache.set('activities', activities, 300000); // 5分鐘快取
        
        // 更新標題顯示活動數量
        if (activitiesTitle) {
            activitiesTitle.textContent = `可領取的活動 (${activities.length})`;
        }
        
        if (activities.length > 0) {
            displayActivities(activities);
        } else {
            earnActivitiesList.innerHTML = '<div class="no-activities">目前沒有可領取的活動</div>';
        }
    } catch (error) {
        console.error('載入活動失敗:', error);
        document.getElementById('earnActivitiesList').innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>網路錯誤</h5>
                <p>無法連接到伺服器，請檢查網路連線</p>
                <button class="btn btn-primary mt-2" onclick="refreshEarnPage()">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
    }
}

// 檢查用戶是否可以參與活動
function checkCanParticipate(activity, participations) {
    const now = new Date();
    
    // 檢查最大參與次數
    if (participations.length >= activity.maxParticipations) {
        return { can: false, reason: '已達最大參與次數' };
    }
    
    // 檢查頻率限制
    if (participations.length > 0) {
        const lastParticipation = new Date(participations[participations.length - 1].time);
        const hoursSinceLastParticipation = (now - lastParticipation) / (1000 * 60 * 60);
        
        if (hoursSinceLastParticipation < activity.frequencyLimit) {
            const waitHours = Math.ceil(activity.frequencyLimit - hoursSinceLastParticipation);
            return { can: false, reason: `${waitHours}小時後可再次參與` };
        }
    }
    
    return { can: true };
}

// 啟動QR掃描 (修復iOS問題)
async function startQRScanner() {
    try {
        if (!liff.isInClient()) {
            showAlert('請在LINE應用程式中開啟此功能', 'warning');
            return;
        }

        const startButton = document.getElementById('startScanBtn');
        const statusDiv = document.getElementById('scanStatus');
        
        startButton.disabled = true;
        startButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>啟動中...';
        statusDiv.innerHTML = '<div class="scan-status loading">正在啟動掃描器...</div>';

        // 使用 LIFF 內建掃描器 - 最簡單穩定的方式
        const result = await liff.scanCodeV2();
        
        // 掃描成功
        startButton.disabled = false;
        startButton.innerHTML = '<i class="bi bi-camera"></i> 開始掃描';
        
        showAlert('QR碼掃描成功，正在驗證...', 'info');
        await claimPointsByQR(result.value);
        
    } catch (error) {
        console.error('掃描失敗:', error);
        
        const startButton = document.getElementById('startScanBtn');
        const statusDiv = document.getElementById('scanStatus');
        
        startButton.disabled = false;
        startButton.innerHTML = '<i class="bi bi-camera"></i> 開始掃描';
        statusDiv.innerHTML = '<div class="scan-status error">掃描失敗</div>';
        
        let errorMessage = '掃描失敗';
        if (error.code === 'INTERNAL_ERROR') {
            errorMessage = '系統內部錯誤，請稍後再試';
        } else if (error.code === 'PERMISSION_DENIED') {
            errorMessage = '請允許相機權限';
        } else if (error.code === 'USER_CANCEL') {
            errorMessage = '掃描已取消';
        }
        
        showAlert(errorMessage, 'danger');
        
        // 3秒後清除狀態
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 3000);
    }
}

// 停止QR掃描 (LIFF內建掃描器不需要手動停止)
function stopQRScanner() {
    // LIFF 內建掃描器會自動關閉，這裡只需要重置UI狀態
    const startButton = document.getElementById('startScanBtn');
    const stopButton = document.getElementById('stopScanBtn');
    
    startButton.style.display = 'block';
    stopButton.style.display = 'none';
    startButton.disabled = false;
    startButton.innerHTML = '<i class="bi bi-camera"></i> 開始掃描';
    document.getElementById('scanStatus').innerHTML = '';
    showAlert('掃描已停止', 'info');
}

// QR掃描領取點數 - 優化版本
// 掃描QR Code領取點數 - 智能更新版本
async function claimPointsByQR(qrCode) {
    // 🔒 防重複請求檢查 - 使用QR碼的hash作為鎖定key
    const qrHash = btoa(qrCode).slice(-20); // 取QR碼的最後20個字符作為hash
    const lockKey = `qr_${qrHash}_${currentUser?.userId}`;
    if (RequestLockManager.isLocked(lockKey)) {
        return;
    }

    // 🔒 鎖定請求
    RequestLockManager.lock(lockKey);

    try {
        showAlert('處理中...', 'info');
        
        // 🔥 解析QR碼以獲取activityId
        let activityId = null;
        try {
            const decodedQR = decodeURIComponent(qrCode);
            const qrData = JSON.parse(atob(decodedQR));
            activityId = qrData.activityId;
        } catch (parseError) {
        }
        
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=claimByQR&userId=${currentUser.userId}&qrCode=${encodeURIComponent(qrCode)}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            
            // 🔒 使用統一管理器設置權威數據
            if (result.currentPoints !== undefined) {
                UserDataManager.setAuthoritative('points', result.currentPoints, 'QR掃描API');
            }
            
            if (result.lotteryTickets !== undefined) {
                UserDataManager.setAuthoritative('lotteryTickets', result.lotteryTickets, 'QR掃描API');
            }
            
            // 🔥 立即更新用戶活動狀態，確保已領取次數立即顯示（僅當有activityId時）
            if (activityId) {
                if (!userActivityStatus[activityId]) {
                    userActivityStatus[activityId] = [];
                }
                userActivityStatus[activityId].push({
                    time: new Date(),
                    points: result.currentPoints || result.lotteryTickets || 0,
                    method: 'QR掃描'
                });
            }
            
            // 立即重新渲染活動列表，顯示更新後的已領取次數
            if (currentPageId === 'earnPage') {
                const activitiesData = cache.get('activities');
                if (activitiesData) {
                    displayActivities(activitiesData);
                } else {
                    // 如果沒有快取，立即重新載入活動數據
                    await loadEarnActivities();
                }
            }
            
            // 清除相關頁面數據快取，確保下次切換頁面時重新載入
            UserDataManager.clearPageData('activities');
            UserDataManager.clearPageData('userActivityStatus');
            
            // 靜態模式：不清除記錄快取，保持記錄頁面靜態
            // cache.clear('pointHistory'); // 保留舊記錄
            // cache.clear('lotteryHistory'); // 保留舊記錄
            
            // 如果當前在記錄查詢頁面，立即重新載入對應的記錄
            if (currentPageId === 'recordsPage') {
                const pointsRecordsTab = document.getElementById('pointsRecordsTab');
                if (pointsRecordsTab && pointsRecordsTab.classList.contains('active')) {
                    setTimeout(() => {
                        loadPointHistory();
                    }, 100); // 短暫延遲確保API操作完成
                }
            }
            
            // 延遲執行背景更新，使用安全更新機制
            setTimeout(async () => {
                await UserDataManager.updateAll('QR掃描背景更新', { updateActivities: true });
            }, 500);
        } else {
            showAlert(result.error || '領取失敗', 'danger');
        }
    } catch (error) {
        console.error('QR掃描領取失敗:', error);
        showAlert('領取失敗，請稍後再試', 'danger');
    } finally {
        // 🔓 解鎖請求
        RequestLockManager.unlock(lockKey);
    }
}

// 按鈕領取點數 - 智能更新版本
async function claimPointsByButton(activityId) {
    // 🔒 防重複請求檢查
    const lockKey = `claim_${activityId}_${currentUser?.userId}`;
    if (RequestLockManager.isLocked(lockKey)) {
        return;
    }

    try {
        // 檢查用戶是否已初始化
        if (!currentUser || !currentUser.userId) {
            showAlert('用戶信息未載入，請重新整理頁面', 'warning');
            return;
        }
        
        // 🔒 鎖定請求並禁用相關按鈕
        RequestLockManager.lock(lockKey);
        const claimButtons = document.querySelectorAll(`[data-activity-id="${activityId}"]`);
        claimButtons.forEach(btn => {
            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = '領取中...';
            btn.setAttribute('data-original-html', originalText);
        });
        
        showAlert('處理中...', 'info');
        
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=claimByButton&userId=${currentUser.userId}&activityId=${activityId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            
            // 🔒 使用統一管理器設置權威數據
            if (result.currentPoints !== undefined) {
                UserDataManager.setAuthoritative('points', result.currentPoints, '按鈕領取API');
            }
            
            if (result.lotteryTickets !== undefined) {
                UserDataManager.setAuthoritative('lotteryTickets', result.lotteryTickets, '按鈕領取API');
            }
            
            // 🔥 立即更新用戶活動狀態，確保已領取次數立即顯示
            if (!userActivityStatus[activityId]) {
                userActivityStatus[activityId] = [];
            }
            userActivityStatus[activityId].push({
                time: new Date(),
                points: result.currentPoints || result.lotteryTickets || 0,
                method: '按鈕領取'
            });
            
            // 🔥 立即重新渲染活動列表，顯示更新後的已領取次數
            if (currentPageId === 'earnPage') {
                const activitiesData = cache.get('activities');
                if (activitiesData) {
                    displayActivities(activitiesData);
                } else {
                    // 如果沒有快取，立即重新載入活動數據
                    await loadEarnActivities();
                }
            }
            
            // 清除相關頁面數據快取，確保下次切換頁面時重新載入
            UserDataManager.clearPageData('activities');
            UserDataManager.clearPageData('userActivityStatus');
            
            // 靜態模式：不清除排行榜快取，保持排行榜靜態
            
            // 靜態模式：不清除記錄快取，保持記錄頁面靜態
            
            // 如果當前在記錄查詢頁面，立即重新載入對應的記錄
            if (currentPageId === 'recordsPage') {
                const pointsRecordsTab = document.getElementById('pointsRecordsTab');
                if (pointsRecordsTab && pointsRecordsTab.classList.contains('active')) {
                    setTimeout(() => {
                        loadPointHistory();
                    }, 100); // 短暫延遲確保API操作完成
                }
            }
            
            // 延遲執行背景更新，使用安全更新機制
            setTimeout(async () => {
                await UserDataManager.updateAll('按鈕領取背景更新', { updateActivities: true });
            }, 500);
            
        } else {
            showAlert(result.error || '領取失敗', 'danger');
        }
    } catch (error) {
        showAlert('領取失敗，請稍後再試', 'danger');
    } finally {
        // 🔓 解鎖請求並恢復按鈕狀態
        RequestLockManager.unlock(lockKey);
        const claimButtons = document.querySelectorAll(`[data-activity-id="${activityId}"]`);
        claimButtons.forEach(btn => {
            btn.disabled = false;
            const originalHtml = btn.getAttribute('data-original-html');
            if (originalHtml) {
                btn.innerHTML = originalHtml;
                btn.removeAttribute('data-original-html');
            }
        });
    }
}



// 兌換商品 - 智能更新版本 + 防重複機制
async function exchangeProduct(productId) {
    if (!currentUser || !currentUser.userId) {
        showAlert('請先登入', 'warning');
        return;
    }

    // 🔒 防重複請求檢查
    const lockKey = `exchange_${productId}_${currentUser.userId}`;
    if (RequestLockManager.isLocked(lockKey)) {
        return;
    }

    let result = null; // 初始化 result 變數

    // 🔒 鎖定請求並禁用相關按鈕
    RequestLockManager.lock(lockKey);
    // 通過產品ID選擇對應的兌換按鈕（支援多種按鈕類別）
    const exchangeButtons = document.querySelectorAll(`[data-product-id="${productId}"]`);
    exchangeButtons.forEach(btn => {
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '兌換中...';
        btn.setAttribute('data-original-html', originalText);
    });

    try {
        showAlert('處理中...', 'info');
        
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=exchangeProduct&userId=${currentUser.userId}&productId=${productId}&accessToken=${liff.getAccessToken()}`
        });
        
        if (!response.ok) {
            throw new Error('網路請求失敗');
        }
        
        result = await response.json();
        
        if (result.success) {
            // 🔓 兌換成功後立即解鎖請求並恢復按鈕狀態
            RequestLockManager.unlock(lockKey);
            const exchangeButtonsRestore = document.querySelectorAll(`[data-product-id="${productId}"]`);
            exchangeButtonsRestore.forEach(btn => {
                btn.disabled = false;
                const originalHtml = btn.getAttribute('data-original-html');
                if (originalHtml) {
                    btn.innerHTML = originalHtml;
                    btn.removeAttribute('data-original-html');
                }
            });

            showAlert(result.message || '兌換成功！', 'success');
            
            // 🔒 使用統一管理器設置權威數據
            if (result.currentPoints !== undefined) {
                UserDataManager.setAuthoritative('points', result.currentPoints, '商品兌換API');
            }
            
            if (result.lotteryTickets !== undefined) {
                UserDataManager.setAuthoritative('lotteryTickets', result.lotteryTickets, '商品兌換API');
            }
            
            // 🔥 立即重新載入兌換商品資料並設置權威數據
            try {
                const exchangedResponse = await fetch(API_BASE_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
                });
                const exchangedResult = await exchangedResponse.json();
                
                if (exchangedResult.success) {
                    // 計算待使用商品數量
                    const now = new Date();
                    const unusedCount = exchangedResult.data.filter(product => {
                        const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                        const isUseExpired = product.useExpirationDate && new Date(product.useExpirationDate) < now;
                        return product.status === '未使用' && !isExpired && !isUseExpired && !product.isExpired;
                    }).length;
                    
                    // 🔒 商品數量也使用權威數據更新，比照點數和抽獎券
                    UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, '商品兌換API');
                    
                    // 更新兌換商品頁面數據
                    UserDataManager.pageData.exchangedProducts = exchangedResult.data;
                    UserDataManager.pageUpdateFlags.exchangedPage = true;
                    
                }
            } catch (error) {
                console.error('更新兌換商品資料失敗:', error);
            }
            
            // 清除相關頁面數據快取
            UserDataManager.clearPageData('exchangedProducts');
            UserDataManager.clearPageData('products');
            
            // 🚫 靜態模式：不清除排行榜快取，保持排行榜靜態
            console.log('📌 排行榜為靜態模式，保留現有快取');
            
            // 🚫 靜態模式：不清除記錄快取，保持記錄頁面靜態
            console.log('📌 記錄頁面為靜態模式，保留現有快取');
            
            // 🔥 如果當前在記錄查詢頁面，立即重新載入對應的記錄
            if (currentPageId === 'recordsPage') {
                const pointsRecordsTab = document.getElementById('pointsRecordsTab');
                if (pointsRecordsTab && pointsRecordsTab.classList.contains('active')) {
                    console.log('🔄 立即重新載入點數記錄...');
                    setTimeout(() => {
                        loadPointHistory();
                    }, 100); // 短暫延遲確保API操作完成
                }
            }
            
            // 🚀 立即執行統一更新（包含商品頁面資料）
            await UserDataManager.updateAll('商品兌換即時更新', { 
                updateProducts: true 
            });
            
            // 立即重新載入並顯示商品列表
            const productsResponse = await fetch(API_BASE_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: `action=getProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
            });
            const productsResult = await productsResponse.json();
            if (productsResult.success) {
                displayProducts(productsResult.data);
            }
            
        } else {
            showAlert(result.error || '兌換失敗', 'danger');
        }
    } catch (error) {
        showAlert('兌換失敗，請稍後再試', 'danger');
        // 🔓 發生錯誤時解鎖請求並恢復按鈕狀態
        RequestLockManager.unlock(lockKey);
        const exchangeButtonsRestore = document.querySelectorAll(`[data-product-id="${productId}"]`);
        exchangeButtonsRestore.forEach(btn => {
            btn.disabled = false;
            const originalHtml = btn.getAttribute('data-original-html');
            if (originalHtml) {
                btn.innerHTML = originalHtml;
                btn.removeAttribute('data-original-html');
            }
        });
        return;
    } finally {
        // 🔓 只在失敗時解鎖請求並恢復按鈕狀態
        if (!result?.success) {
            RequestLockManager.unlock(lockKey);
            const exchangeButtonsRestore = document.querySelectorAll(`[data-product-id="${productId}"]`);
            exchangeButtonsRestore.forEach(btn => {
                btn.disabled = false;
                const originalHtml = btn.getAttribute('data-original-html');
                if (originalHtml) {
                    btn.innerHTML = originalHtml;
                    btn.removeAttribute('data-original-html');
                }
            });
        }
    }
}

// 顯示提示訊息
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertId = 'alert-' + Date.now();
    
    // 移除現有的提示訊息
    const existingAlerts = alertContainer.querySelectorAll('.alert-custom');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertHTML = `
        <div class="alert-wrapper">
        <div id="${alertId}" class="alert alert-${type} alert-custom alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        </div>
    `;
    
    alertContainer.innerHTML = alertHTML;
    
    // 自動隱藏
    const hideTimeout = setTimeout(() => {
        const alertElement = document.getElementById(alertId);
        if (alertElement) {
            alertElement.style.animation = 'alertFadeOut 0.3s ease-in forwards';
            setTimeout(() => alertElement.remove(), 300);
        }
    }, 3000);
    
    // 當使用者手動關閉時，清除自動隱藏的計時器
    const closeButton = alertContainer.querySelector('.btn-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            clearTimeout(hideTimeout);
        });
    }
}

// 格式化日期時間
function formatDateTime(dateInput) {
    try {
        const date = new Date(dateInput);
        
        // 檢查日期是否有效
        if (isNaN(date.getTime())) {
            console.error('無效的日期:', dateInput);
            return '時間格式錯誤';
        }
        
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        
        const ampm = hours >= 12 ? '下午' : '上午';
        const formattedHours = hours % 12 || 12;
        
        const formattedDate = date.toLocaleDateString('zh-TW');
        const formattedTime = `${ampm} ${formattedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        return `${formattedDate} ${formattedTime}`;
    } catch (error) {
        console.error('formatDateTime 錯誤:', error);
        return '時間格式錯誤';
    }
}

// 格式化日期範圍
function formatDateRange(startTime, endTime) {
    try {
        const start = new Date(startTime);
        const end = new Date(endTime);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return '時間格式錯誤';
        }
        
        const startStr = start.toLocaleDateString('zh-TW');
        const endStr = end.toLocaleDateString('zh-TW');
        
        if (startStr === endStr) {
            return startStr;
        } else {
            return `${startStr} ~ ${endStr}`;
        }
    } catch (error) {
        console.error('formatDateRange 錯誤:', error);
        return '時間格式錯誤';
    }
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW') + ' ' + date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', function() {
    // 立即初始化並顯示進度條
    ProgressManager.init();
    ProgressManager.show();
    ProgressManager.quickProgress(); // 直接跳到 80-90%
    
    initializeLiff();
    
    // 移除重複的預載服務，因為 loadAllDataUltraFast 已經包含了所有必要操作
    // 原本的智能預載服務會與 loadAllDataUltraFast 產生重複載入
});

// 🔍 Debug函數：檢查快取狀況
window.debugCache = function() {
    console.log('🔍 目前所有快取狀況:');
    console.log('點數記錄:', cache.get('pointHistory'));
    console.log('抽獎記錄:', cache.get('lotteryHistory'));
    console.log('抽獎券:', cache.get('lotteryTickets'));
    console.log('商品:', cache.get('products'));
    console.log('排行榜:', cache.get('leaderboard'));
    
    // 特別檢查抽獎記錄
    const lotteryHistory = cache.get('lotteryHistory');
    if (lotteryHistory) {
        console.log('🔍 抽獎記錄詳細檢查:', {
            type: typeof lotteryHistory,
            hasRecords: !!lotteryHistory.records,
            recordsType: typeof lotteryHistory.records,
            isArray: Array.isArray(lotteryHistory.records),
            length: lotteryHistory.records ? lotteryHistory.records.length : 'N/A',
            currentTickets: lotteryHistory.currentTickets
        });
    } else {
        console.log('❌ 沒有抽獎記錄快取');
    }
}; 

// 顯示進行中活動列表
function displayActivityList(activities) {
    const activitiesContainer = document.getElementById('activitiesList');
    activitiesContainer.innerHTML = '';

    if (activities.length === 0) {
        activitiesContainer.innerHTML = '<div class="no-activities">目前沒有進行中的活動</div>';
        return;
    }

    activities.forEach(activity => {
        const card = document.createElement('div');
        card.className = 'activity-card-vertical';
        
        // 活動標題區域
        const header = document.createElement('div');
        header.className = 'activity-header';
        
        const title = document.createElement('div');
        title.className = 'activity-title';
        title.textContent = activity.name;
        
        const points = document.createElement('div');
        points.className = 'activity-points-large';
        points.textContent = `+${activity.points}`;
        
        header.appendChild(title);
        header.appendChild(points);
        
        // 活動描述
        const description = document.createElement('div');
        description.className = 'activity-description';
        description.textContent = activity.description;
        
        // 活動詳細資訊
        const details = document.createElement('div');
        details.className = 'activity-time';
        details.innerHTML = `<i class="bi bi-calendar-range"></i> ${formatDateRange(activity.startTime, activity.endTime)}`;
        
        // 組裝卡片
        card.appendChild(header);
        card.appendChild(description);
        card.appendChild(details);
        
        activitiesContainer.appendChild(card);
    });
}

// 顯示可領取活動列表
function displayActivities(activities) {
    const activitiesContainer = document.getElementById('earnActivitiesList');
    const activitiesTitle = document.getElementById('activitiesTitle');
    
    // 更新標題顯示活動數量
    if (activitiesTitle) {
        activitiesTitle.textContent = `可領取的活動 (${activities.length})`;
    }
    
    activitiesContainer.innerHTML = '';

    if (activities.length === 0) {
        activitiesContainer.innerHTML = '<div class="no-activities">目前沒有可領取的活動</div>';
        return;
    }

    activities.forEach(activity => {
        const participations = userActivityStatus[activity.id] || [];
        const participationCount = participations.length;
        const maxParticipations = activity.maxParticipations || 999;

        const card = document.createElement('div');
        card.className = 'activity-card';
        
        // 活動類型標籤
        const typeLabel = document.createElement('span');
        typeLabel.className = 'activity-type';
        typeLabel.textContent = activity.frequencyLimit <= 24 ? '每日活動' : '週期活動';
        
        // 左側內容容器
        const leftContent = document.createElement('div');
        leftContent.className = 'activity-left';
        
        // 活動標題
        const title = document.createElement('div');
        title.className = 'activity-title';
        title.textContent = activity.name;
        
        // 活動描述
        const description = document.createElement('div');
        description.className = 'activity-description';
        description.textContent = activity.description;
        
        // 領取次數資訊
        const participationInfo = document.createElement('div');
        participationInfo.className = 'activity-participation small text-info';
        participationInfo.innerHTML = `已領取次數：${participationCount}/${maxParticipations === 999 ? '無限' : maxParticipations}`;
        
        // 活動時間資訊
        const timeInfo = document.createElement('div');
        timeInfo.className = 'activity-time';
        
        // 右側內容容器
        const rightContent = document.createElement('div');
        rightContent.className = 'activity-right';
        
        // 獎勵點數
        const points = document.createElement('div');
        points.className = 'activity-points';
        points.innerHTML = `+${activity.points}`;
        
        // 領取按鈕或提示文字
        let button = null; // 初始化按鈕變數
        
        if (!activity.allowButtonClaim) {
            const scanButton = document.createElement('div');
            scanButton.className = 'qr-only-notice';
            scanButton.style.cursor = 'pointer';
            scanButton.innerHTML = '<i class="bi bi-qr-code"></i> 按我掃描領取';
            scanButton.onclick = () => startQRScanner();
            rightContent.appendChild(points);
            rightContent.appendChild(scanButton);
        } else {
            // 領取按鈕
            button = document.createElement('button');
            button.className = 'activity-button';
            button.textContent = '領取';
            button.setAttribute('data-activity-id', activity.id);
            button.onclick = () => claimPointsByButton(activity.id);
            rightContent.appendChild(points);
            rightContent.appendChild(button);
        }
        
        // 活動狀態
        const status = document.createElement('span');
        status.className = 'activity-status';
        
        // 檢查活動是否已過期
        const now = new Date();
        const endTime = new Date(activity.endTime);
        
        // 檢查時間是否有效
        if (isNaN(endTime.getTime())) {
            timeInfo.innerHTML = `<i class="bi bi-clock"></i> 時間資訊錯誤`;
            return;
        }
        
        if (now > endTime) {
            card.classList.add('activity-disabled');
            status.className = 'activity-status status-expired';
            status.textContent = '已結束';
            if (button) {
                button.disabled = true;
                button.textContent = '已結束';
                button.style.backgroundColor = '#ccc';
                button.style.cursor = 'not-allowed';
            }
            timeInfo.innerHTML = `<i class="bi bi-clock"></i> 活動已結束`;
        } else if (participationCount >= maxParticipations) {
            // 檢查是否已達最大參與次數
            card.classList.add('activity-disabled');
            status.className = 'activity-status status-completed';
            status.textContent = '已完成';
            if (button) {
                button.disabled = true;
                button.textContent = '已完成';
                button.style.backgroundColor = '#ccc';
                button.style.cursor = 'not-allowed';
            }
            timeInfo.innerHTML = `<i class="bi bi-check-circle"></i> 已達最大參與次數<br><i class="bi bi-calendar-x"></i> 結束時間：${formatDateTime(endTime)}`;
        } else if (participations.length > 0) {
            // 檢查是否在冷卻時間內
            const lastParticipation = new Date(participations[participations.length - 1].time);
            const nextAvailable = new Date(lastParticipation.getTime() + activity.frequencyLimit * 60 * 60 * 1000);
            
            if (now < nextAvailable) {
                card.classList.add('activity-waiting');
                status.className = 'activity-status status-waiting';
                status.textContent = '等待中';
                if (button) {
                    button.disabled = true;
                    button.textContent = '等待中';
                    button.style.backgroundColor = '#ccc';
                    button.style.cursor = 'not-allowed';
                }
                
                // 計算剩餘時間
                const remainingMs = nextAvailable - now;
                const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
                const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                
                if (remainingHours > 0) {
                    timeInfo.innerHTML = `<i class="bi bi-clock"></i> ${remainingHours}小時${remainingMinutes}分鐘後可再次領取<br><i class="bi bi-calendar-x"></i> 結束時間：${formatDateTime(endTime)}`;
                } else {
                    timeInfo.innerHTML = `<i class="bi bi-clock"></i> ${remainingMinutes}分鐘後可再次領取<br><i class="bi bi-calendar-x"></i> 結束時間：${formatDateTime(endTime)}`;
                }
            } else {
                card.classList.add('activity-available');
                status.className = 'activity-status status-available';
                status.textContent = '可領取';
                timeInfo.innerHTML = `<i class="bi bi-clock"></i> 每${activity.frequencyLimit}小時可領取一次<br><i class="bi bi-calendar-x"></i> 結束時間：${formatDateTime(endTime)}`;
            }
        } else {
            // 從未參與過
            card.classList.add('activity-available');
            status.className = 'activity-status status-available';
            status.textContent = '可領取';
            timeInfo.innerHTML = `<i class="bi bi-clock"></i> 每${activity.frequencyLimit}小時可領取一次<br><i class="bi bi-calendar-x"></i> 結束時間：${formatDateTime(endTime)}`;
        }
        
        // 組裝卡片
        leftContent.appendChild(title);
        leftContent.appendChild(description);
        leftContent.appendChild(participationInfo);
        leftContent.appendChild(timeInfo);
        
        rightContent.appendChild(status);
        
        card.appendChild(typeLabel);
        card.appendChild(leftContent);
        card.appendChild(rightContent);
        
        activitiesContainer.appendChild(card);
    });
}

// 顯示商品列表
function displayProducts(products) {
    const productsContainer = document.getElementById('productsList');
    productsContainer.innerHTML = '';

    if (products.length === 0) {
        productsContainer.innerHTML = '<div class="no-products">目前沒有可兌換的商品</div>';
        return;
    }

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // 左側內容容器
        const leftContent = document.createElement('div');
        leftContent.className = 'product-left';
        
        // 商品標題
        const title = document.createElement('div');
        title.className = 'product-title';
        title.textContent = product.name;
        
        // 商品描述
        const description = document.createElement('div');
        description.className = 'product-description';
        description.textContent = product.description;
        
        // 商品詳細資訊
        const details = document.createElement('div');
        details.className = 'product-details';
        details.innerHTML = `<i class="bi bi-box"></i> 庫存: ${product.stock}`;
        
        // 使用期限
        const expiryInfo = document.createElement('div');
        expiryInfo.className = 'product-expiry small text-muted';
        if (product.expirationDate) {
            expiryInfo.innerHTML = `<i class="bi bi-calendar-x"></i> 使用期限：${formatDateTime(product.expirationDate)}`;
        }
        
        // 右側內容容器
        const rightContent = document.createElement('div');
        rightContent.className = 'product-right';
        
        // 兌換點數
        const cost = document.createElement('div');
        cost.className = 'product-cost';
        cost.textContent = `${product.requiredPoints}`;
        
        // 兌換按鈕
        const button = document.createElement('button');
        button.className = 'product-exchange-btn';
        button.textContent = '兌換';
        
        // 商品狀態
        const status = document.createElement('span');
        status.className = 'product-status';
        
        // 檢查商品狀態
        const now = new Date();
        const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
        
        if (isExpired) {
            status.className = 'product-status status-expired';
            status.textContent = '已過期';
            button.disabled = true;
            button.textContent = '已過期';
        } else if (product.stock <= 0) {
            status.className = 'product-status status-out-of-stock';
            status.textContent = '缺貨';
            button.disabled = true;
            button.textContent = '缺貨';
        } else if (product.stock <= 5) {
            status.className = 'product-status status-low-stock';
            status.textContent = '少量';
        } else {
            status.className = 'product-status status-available';
            status.textContent = '有貨';
        }
        
        // 設置按鈕事件和標識
        button.setAttribute('data-product-id', product.id);
        if (!button.disabled) {
            button.onclick = () => exchangeProduct(product.id);
        }
        
        // 組裝左側內容
        leftContent.appendChild(title);
        leftContent.appendChild(description);
        leftContent.appendChild(details);
        if (product.expirationDate) {
            leftContent.appendChild(expiryInfo);
        }
        
        // 組裝右側內容
        rightContent.appendChild(cost);
        rightContent.appendChild(button);
        
        // 組裝卡片
        card.appendChild(leftContent);
        card.appendChild(rightContent);
        card.appendChild(status);
        
        productsContainer.appendChild(card);
    });
}

// 重新整理領取點數頁面 - 優化版本
async function refreshEarnPage() {
    try {
        showAlert('正在重新整理...', 'info');
        // 清理相關快取
        cache.clear('activities');
        cache.clear('userActivityStatus');
        cache.clear('pointsResult');
        
        await loadEarnActivities();
        await loadUserPoints();
        showAlert('重新整理完成', 'success');
    } catch (error) {
        console.error('重新整理失敗:', error);
        showAlert('重新整理失敗', 'danger');
    }
}

// 重新整理記錄查詢頁面 - 優化版本
function refreshRecordsPage() {
    // 🚫 靜態模式：不再自動清除和載入，改為呼叫手動更新
    console.log('📌 記錄頁面靜態模式：使用手動更新功能');
    
    // 呼叫手動更新記錄函數（會清除快取並重新載入）
    manualRefreshRecords();
    
    // 仍然更新點數顯示
    loadUserPoints();
}

// 重新整理商品頁面 - 優化版本
function refreshProductsPage() {
    // 清理相關快取
    cache.clear('products');
    cache.clear('pointsResult');
    
    loadProducts();
    loadUserPoints();
    showAlert('重新整理完成', 'success');
}

// 重新整理已兌換商品頁面 - 優化版本
function refreshExchangedPage() {
    // 清理相關快取
    cache.clear('exchangedResult');
    cache.clear('pointsResult');
    
    loadExchangedProducts();
    loadUserPoints();
    showAlert('重新整理完成', 'success');
}

// 重新整理排行榜頁面 - 優化版本
function refreshLeaderboardPage() {
    // 清理相關快取
    cache.clear('leaderboard');
    cache.clear('pointsResult');
    
    loadLeaderboard();
    loadUserPoints();
    showAlert('重新整理完成', 'success');
}

// 載入已兌換商品 - 優化版本
async function loadExchangedProducts() {
    const unusedList = document.getElementById('unusedProductsList');
    const usedList = document.getElementById('usedProductsList');
    
    // 先檢查快取
    const cachedResult = cache.get('exchangedResult');
    if (cachedResult && cachedResult.success) {
        console.log('✅ 使用已兌換商品快取資料，立即顯示');
        displayExchangedProducts(cachedResult.data);
        return;
    }
    
    // 沒有快取時才顯示載入畫面
    const loadingHtml = `
        <div class="loading">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">載入中...</span>
            </div>
        </div>
    `;
    if (unusedList) unusedList.innerHTML = loadingHtml;
    if (usedList) usedList.innerHTML = loadingHtml;
    
    try {
        const response = await fetch(`${API_BASE_URL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 快取結果
            cache.set('exchangedResult', result, 300000); // 5分鐘快取
            displayExchangedProducts(result.data);
        } else {
            const errorHtml = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>載入失敗</h5>
                    <p>${result.error || '載入已兌換商品失敗'}</p>
                    <button class="btn btn-primary" onclick="loadExchangedProducts()">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
            if (unusedList) unusedList.innerHTML = errorHtml;
            if (usedList) usedList.innerHTML = '';
        }
    } catch (error) {
        console.error('載入已兌換商品失敗:', error);
        const errorHtml = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>網路錯誤</h5>
                <p>無法連接到伺服器，請檢查網路連線</p>
                <button class="btn btn-primary" onclick="loadExchangedProducts()">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
        if (unusedList) unusedList.innerHTML = errorHtml;
        if (usedList) usedList.innerHTML = '';
    }
}

// 切換已兌換商品分頁
function switchExchangeTab(tabId) {
    const unusedTab = document.getElementById('unusedTabBtn');
    const usedTab = document.getElementById('usedTabBtn');
    
    if (tabId === 'unused') {
        // 設置待使用為選中狀態
        unusedTab.className = 'tab-btn tab-active';
        usedTab.className = 'tab-btn tab-inactive';
        
        // 顯示待使用內容，隱藏已使用內容
        document.getElementById('unusedProductsTab').classList.add('active');
        document.getElementById('usedProductsTab').classList.remove('active');
    } else {
        // 設置已使用為選中狀態
        unusedTab.className = 'tab-btn tab-inactive';
        usedTab.className = 'tab-btn tab-active';
        
        // 顯示已使用內容，隱藏待使用內容
        document.getElementById('unusedProductsTab').classList.remove('active');
        document.getElementById('usedProductsTab').classList.add('active');
    }
}

// 切換記錄標籤 - 靜態模式（不自動載入）
function switchRecordsTab(tabId) {
    console.log('🔄 switchRecordsTab 被調用, tabId:', tabId);
    
    // 🔥 修正參數對應：將簡化參數轉換為完整DOM ID
    let targetTabId, targetBtnId;
    if (tabId === 'points') {
        targetTabId = 'pointsRecordsTab';
        targetBtnId = 'pointsRecordsTabBtn';
    } else if (tabId === 'lottery') {
        targetTabId = 'lotteryRecordsTab';
        targetBtnId = 'lotteryRecordsTabBtn';
    } else {
        // 如果已經是完整ID，直接使用
        targetTabId = tabId;
        targetBtnId = tabId + 'Btn';
    }
    
    console.log('🎯 標籤轉換:', { 原始: tabId, 目標: targetTabId });
    
    // 更新標籤狀態
    document.querySelectorAll('#recordsPage .tab-btn').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('tab-inactive');
    });
    
    document.querySelectorAll('#recordsPage .tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 啟用新標籤按鈕
    const activeTabBtn = document.getElementById(targetBtnId);
    if (activeTabBtn) {
        activeTabBtn.classList.add('tab-active');
        activeTabBtn.classList.remove('tab-inactive');
    }
    
    // 啟用新標籤內容
    const activeTabContent = document.getElementById(targetTabId);
    if (activeTabContent) {
        activeTabContent.classList.add('active');
    }
    
    // 🚀 Firebase 模式：直接使用 Firebase 已載入的數據
    if (targetTabId === 'pointsRecordsTab') {
        const firebaseHistory = currentUser ? FirebaseDataManager.getPointHistory(currentUser.userId) : [];
        const historyListElement = document.getElementById('historyList');
        
        if (firebaseHistory && firebaseHistory.length > 0) {
            displayPointHistory(firebaseHistory);
            console.log('✅ 顯示 Firebase 點數記錄:', firebaseHistory.length, '筆');
        } else {
            historyListElement.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-inbox"></i>
                    <p class="mb-0">目前沒有點數記錄</p>
                </div>
            `;
            console.log('⚠️ Firebase 點數記錄為空');
        }
    } else if (targetTabId === 'lotteryRecordsTab') {
        const cachedHistory = cache.get('lotteryHistory');
        const lotteryHistoryListElement = document.getElementById('lotteryHistoryList');
        
        // 🔍 詳細debug快取狀況
        console.log('🔍 抽獎記錄快取檢查:', {
            cachedHistory: cachedHistory,
            type: typeof cachedHistory,
            hasRecords: cachedHistory && cachedHistory.records,
            recordsType: cachedHistory && typeof cachedHistory.records,
            recordsIsArray: cachedHistory && Array.isArray(cachedHistory.records),
            recordsLength: cachedHistory && cachedHistory.records ? cachedHistory.records.length : 'N/A'
        });
        
        // 🚀 使用 Firebase 抽獎記錄數據
        const firebaseLotteryHistory = currentUser ? FirebaseDataManager.getLotteryHistory(currentUser.userId) : [];
        console.log('🔍 Firebase 抽獎記錄:', firebaseLotteryHistory);
        
        if (firebaseLotteryHistory && firebaseLotteryHistory.length > 0) {
            // Firebase 數據是直接的陣列格式，不需要 .records
            const currentTickets = currentUser ? (FirebaseDataManager.getUserData(currentUser.userId)?.lotteryTickets || 0) : 0;
            displayLotteryHistory(firebaseLotteryHistory, currentTickets);
            console.log('✅ 顯示 Firebase 抽獎記錄:', firebaseLotteryHistory.length, '筆');
        } else {
            lotteryHistoryListElement.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-gift"></i>
                    <p class="mb-0">目前沒有抽獎記錄</p>
                </div>
            `;
            console.log('⚠️ Firebase 抽獎記錄為空');
        }
    }
    
    // 🔥 統一顯示更新時間（使用 pointHistory 的時間）
    const updateTime = UpdateTimeManager.getTimeAgo('pointHistory');
    const lastUpdateElement = document.getElementById('recordsLastUpdateTime');
    if (lastUpdateElement) {
        if (updateTime) {
            lastUpdateElement.textContent = `${updateTime}`;
        } else {
            lastUpdateElement.textContent = '請點擊更新按鈕載入資料';
        }
    }
    
    console.log('📌 記錄查詢：靜態模式，顯示快取資料');
}

// 顯示已兌換商品
function displayExchangedProducts(products) {
    const unusedList = document.getElementById('unusedProductsList');
    const usedList = document.getElementById('usedProductsList');
    
    // 清空現有內容
    unusedList.innerHTML = '';
    usedList.innerHTML = '';
    
    // 檢查商品是否過期
    const now = new Date();
    products.forEach(product => {
        // 檢查商品管理的期限
        const expiryDate = product.expirationDate ? new Date(product.expirationDate) : null;
        const isExpiredByProductDate = expiryDate && expiryDate < now;
        
        // 檢查抽獎商品的使用期限
        const useExpiryDate = product.useExpirationDate ? new Date(product.useExpirationDate) : null;
        const isExpiredByUseDate = useExpiryDate && useExpiryDate < now;
        
        // 任一期限過期即視為過期，或者後端已標記為已過期
        product.isExpired = isExpiredByProductDate || isExpiredByUseDate || product.status === '已過期';
    });
    
    // 分類商品
    const unusedProducts = products.filter(p => (p.status === '未使用' || p.status === '待使用') && !p.isExpired);
    const usedOrExpiredProducts = products.filter(p => p.status === '已使用' || p.status === '已過期' || p.isExpired)
        .sort((a, b) => {
            if (a.useTime && b.useTime) {
                return new Date(b.useTime) - new Date(a.useTime);
            }
            if (a.useTime) return -1;
            if (b.useTime) return 1;
            return new Date(b.expirationDate) - new Date(a.expirationDate);
        });
    
    // 更新待使用商品數量顯示
    const unusedTab = document.getElementById('unusedTabBtn');
    if (unusedTab) {
        unusedTab.innerHTML = `<i class="bi bi-box-seam"></i> 待使用商品 (${unusedProducts.length})`;
    }
    
    // 🔒 使用權威數據機制更新待使用商品數量，確保不被覆蓋
    UserDataManager.setAuthoritative('unusedProductsCount', unusedProducts.length, 'displayExchangedProducts');
    UserDataManager.updateUI('unusedProductsCount', unusedProducts.length);
    console.log(`📊 displayExchangedProducts 設置權威數量並更新UI: ${unusedProducts.length}`);
    
    // 只顯示最近40筆已使用/已過期的商品
    const recentUsedProducts = usedOrExpiredProducts.slice(0, 40);
    
    // 顯示待使用商品
    if (unusedProducts.length === 0) {
        unusedList.innerHTML = '<div class="text-center text-muted py-4">目前沒有待使用的商品</div>';
    } else {
        unusedProducts.forEach(product => {
            unusedList.appendChild(createExchangedProductCard(product, false));
        });
    }
    
    // 顯示已使用/已過期商品
    if (usedOrExpiredProducts.length === 0) {
        usedList.innerHTML = '<div class="text-center text-muted py-4">目前沒有已使用或已過期的商品</div>';
    } else {
        // 如果有超過40筆記錄，顯示額外說明
        if (usedOrExpiredProducts.length > 40) {
            const countInfo = document.createElement('div');
            countInfo.className = 'text-center mb-3';
            countInfo.innerHTML = `
                <small class="text-muted">
                    <i class="bi bi-info-circle"></i> 
                    共 ${usedOrExpiredProducts.length} 筆記錄，僅顯示最近 40 筆
                </small>
            `;
            usedList.appendChild(countInfo);
        }
        
        recentUsedProducts.forEach(product => {
            usedList.appendChild(createExchangedProductCard(product, product.status === '已使用'));
        });
    }
}

// 建立已兌換商品卡片
function createExchangedProductCard(product, isUsed) {
    const card = document.createElement('div');
    card.className = 'product-card mb-3';
    
    // 決定狀態顯示
    let statusClass, statusText;
    if (product.status === '已使用' || isUsed) {
        statusClass = 'status-redeemed';
        statusText = '已使用';
    } else if (product.status === '已過期' || product.isExpired) {
        statusClass = 'status-expired';
        statusText = '已過期';
    } else {
        // 檢查是否快過期（7天內）
        const now = new Date();
        const finalExpirationDate = product.useExpirationDate || product.expirationDate;
        const expiryDate = finalExpirationDate ? new Date(finalExpirationDate) : null;
        
        if (expiryDate) {
            const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry <= 7) {
                statusClass = 'status-expiring-soon';
                statusText = '快過期';
            } else {
                statusClass = 'status-pending';
                statusText = '待使用';
            }
        } else {
            statusClass = 'status-pending';
            statusText = '待使用';
        }
    }
    
    // 商品期限資訊
    let timeInfoHTML = '';
    
    // 1. 兌換時間（一定會有）
    timeInfoHTML += `<div>兌換時間：${formatDateTime(product.exchangeTime)}</div>`;
    
    // 2. 使用期限（優先顯示useExpirationDate，避免重複）
    const finalExpirationDate = product.useExpirationDate || product.expirationDate;
    if (finalExpirationDate) {
        const expiration = new Date(finalExpirationDate);
        const now = new Date();
        
        if (product.status === '已過期' || now > expiration) {
            timeInfoHTML += `<div class="text-danger">使用期限：${formatDateTime(finalExpirationDate)} (已過期)</div>`;
        } else {
            timeInfoHTML += `<div>使用期限：${formatDateTime(finalExpirationDate)}</div>`;
        }
    }
    
    // 3. 使用時間（如果有）
    if (product.useTime) {
        timeInfoHTML += `<div>使用時間：${formatDateTime(product.useTime)}</div>`;
    }
    
    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="mb-0">${product.name || '未知商品'}</h5>
                    <span class="redemption-status ${statusClass} ms-3">${statusText}</span>
                </div>
                <p class="mb-2 text-muted small">${product.description || ''}</p>
                <div class="time-info text-muted small">
                    ${timeInfoHTML}
                </div>
            </div>
        </div>
        ${(product.status === '未使用' || product.status === '待使用') && !product.isExpired ? `
            <div class="text-end mt-2">
                <button class="redeem-action-btn" onclick="useProduct('${product.exchangeId}', '${product.name || '未知商品'}')">
                    <i class="bi bi-check-circle"></i> 標記已使用
                </button>
            </div>
        ` : ''}
    `;
    
    return card;
}

// 顯示商品使用確認對話框
function showUseProductModal(exchangeId, productName) {
    const modal = document.getElementById('useProductModal');
    const productNameElement = document.getElementById('useProductName');
    const confirmBtn = document.getElementById('confirmUseProductBtn');
    
    // 設置商品名稱
    productNameElement.textContent = productName;
    
    // 設置確認按鈕事件
    confirmBtn.onclick = () => {
        closeUseProductModal();
        executeUseProduct(exchangeId, productName);
    };
    
    // 顯示對話框
    modal.classList.add('show');
}

// 關閉商品使用確認對話框
function closeUseProductModal() {
    const modal = document.getElementById('useProductModal');
    modal.classList.remove('show');
}

// 使用商品 - 智能更新版本
async function useProduct(exchangeId, productName) {
    showUseProductModal(exchangeId, productName);
}

// 執行商品使用
async function executeUseProduct(exchangeId, productName) {
    // 🔒 防重複請求檢查
    const lockKey = `use_${exchangeId}_${currentUser?.userId}`;
    if (RequestLockManager.isLocked(lockKey)) {
        console.log('⚠️ 使用商品請求進行中，忽略重複點擊');
        return;
    }

    // 🔒 鎖定請求
    RequestLockManager.lock(lockKey);

    try {
        showAlert('處理中...', 'info');
        
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=useProduct&exchangeId=${exchangeId}&userId=${currentUser.userId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message || '使用成功！', 'success');
            
            // 🔒 使用統一管理器處理抽獎券更新
            if (result.lotteryTickets !== undefined) {
                UserDataManager.setAuthoritative('lotteryTickets', result.lotteryTickets, '商品使用API');
            }
            
            // 🔥 立即重新載入兌換商品資料並設置權威數據
            try {
                const exchangedResponse = await fetch(API_BASE_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
                });
                const exchangedResult = await exchangedResponse.json();
                
                if (exchangedResult.success) {
                    // 計算待使用商品數量
                    const now = new Date();
                    const unusedCount = exchangedResult.data.filter(product => {
                        const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                        const isUseExpired = product.useExpirationDate && new Date(product.useExpirationDate) < now;
                        return product.status === '未使用' && !isExpired && !isUseExpired && !product.isExpired;
                    }).length;
                    
                    // 🔒 商品數量使用權威數據更新，確保即時生效
                    UserDataManager.setAuthoritative('unusedProductsCount', unusedCount, '商品使用API');
                    
                    console.log('✅ 商品使用後立即更新待使用商品數量:', unusedCount);
                }
            } catch (error) {
                console.error('更新兌換商品資料失敗:', error);
            }
            
            // 清除相關頁面數據快取
            UserDataManager.clearPageData('exchangedProducts');
            
            // 🚀 使用統一管理器立即更新所有用戶資料
            console.log('📊 商品使用後立即統一更新...');
            await UserDataManager.updateAll('商品使用即時更新');
            
            console.log('✅ 商品使用完成，已使用統一管理器更新');
        } else {
            showAlert(result.error || '使用失敗', 'danger');
        }
    } catch (error) {
        console.error('使用商品失敗:', error);
        showAlert('使用失敗，請稍後再試', 'danger');
    } finally {
        // 🔓 解鎖請求
        RequestLockManager.unlock(lockKey);
        
        // 關閉使用商品模態框
        closeUseProductModal();
    }
}

// 載入排行榜 - 背景更新優化版本
async function loadLeaderboard(forceUpdate = false) {
    const myRankCard = document.getElementById('myRankCard');
    const leaderboardList = document.getElementById('leaderboardList');
    
    // 檢查快取，優先顯示快取資料
    const cachedLeaderboard = cache.get('leaderboard');
    
    if (cachedLeaderboard && !forceUpdate) {
        console.log('✅ 使用排行榜快取資料，立即顯示');
        displayLeaderboard(cachedLeaderboard.leaderboard, cachedLeaderboard.myRank);
        UpdateTimeManager.updateTimeDisplay('leaderboard', 'leaderboardLastUpdateTime');
        return;
    }
    
    // 如果是強制更新，顯示載入動畫
    if (forceUpdate) {
        const refreshBtn = document.getElementById('leaderboardManualRefreshBtn');
        if (refreshBtn) {
            refreshBtn.classList.add('refreshing');
            refreshBtn.disabled = true;
        }
        document.getElementById('leaderboardLastUpdateTime').textContent = '更新中...';
    }
    
    // 沒有快取時才顯示載入畫面
    if (!cachedLeaderboard) {
        const loadingHtml = `
            <div class="loading">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
            </div>
        `;
        if (myRankCard) myRankCard.innerHTML = loadingHtml;
        if (leaderboardList) leaderboardList.innerHTML = loadingHtml;
        document.getElementById('leaderboardLastUpdateTime').textContent = '載入中...';
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}?action=getLeaderboard&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            // 快取排行榜資料
            cache.set('leaderboard', result.data, 7200000); // 靜態模式：2小時快取
            UpdateTimeManager.saveUpdateTime('leaderboard');
            displayLeaderboard(result.data.leaderboard, result.data.myRank);
            UpdateTimeManager.updateTimeDisplay('leaderboard', 'leaderboardLastUpdateTime');
            
            if (forceUpdate) {
                showAlert('排行榜已更新', 'success');
            }
        } else {
            const errorHtml = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>載入失敗</h5>
                    <p>${result.error || '載入排行榜失敗'}</p>
                    <button class="btn btn-primary" onclick="loadLeaderboard(true)">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
            if (myRankCard) myRankCard.innerHTML = errorHtml;
            if (leaderboardList) leaderboardList.innerHTML = '';
            document.getElementById('leaderboardLastUpdateTime').textContent = '載入失敗';
        }
    } catch (error) {
        console.error('載入排行榜失敗:', error);
        const errorHtml = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>網路錯誤</h5>
                <p>無法連接到伺服器，請檢查網路連線</p>
                <button class="btn btn-primary" onclick="loadLeaderboard(true)">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
        if (myRankCard) myRankCard.innerHTML = errorHtml;
        if (leaderboardList) leaderboardList.innerHTML = '';
        document.getElementById('leaderboardLastUpdateTime').textContent = '載入失敗';
    } finally {
        // 移除載入動畫
        if (forceUpdate) {
            const refreshBtn = document.getElementById('leaderboardManualRefreshBtn');
            if (refreshBtn) {
                refreshBtn.classList.remove('refreshing');
                refreshBtn.disabled = false;
            }
        }
    }
}

// 顯示排行榜
function displayLeaderboard(leaderboard, myRank) {
    const myRankCard = document.getElementById('myRankCard');
    const leaderboardList = document.getElementById('leaderboardList');
    
    // 顯示我的排名
    if (myRank) {
        myRankCard.innerHTML = createMyRankSection(myRank, leaderboard);
    } else {
        myRankCard.innerHTML = '<div class="no-leaderboard">無法取得您的排名資訊</div>';
    }
    
    // 顯示排行榜
    if (leaderboard && leaderboard.length > 0) {
        leaderboardList.innerHTML = leaderboard.map((user, index) => 
            createRankCard({...user, rank: index + 1}, false)
        ).join('');
    } else {
        leaderboardList.innerHTML = '<div class="no-leaderboard"><i class="bi bi-arrow-clockwise"></i>目前沒有排行榜資料</div>';
    }
}

// 創建我的排名區域（包含前後各一名）
function createMyRankSection(myRank, leaderboard) {
    let html = '';
    
    // 找到我前後的用戶
    let prevUser = null;
    let nextUser = null;
    
    // 如果我的排名大於1，顯示前一名
    if (myRank.rank > 1) {
        // 嘗試從排行榜中找到前一名
        if (leaderboard && leaderboard.length >= myRank.rank - 1) {
            prevUser = {
                ...leaderboard[myRank.rank - 2],
                rank: myRank.rank - 1
            };
        } else {
            // 如果排行榜中沒有，創建一個佔位符
            prevUser = {
                rank: myRank.rank - 1,
                lineName: '前一名用戶',
                fbName: '前一名用戶',
                currentPoints: myRank.currentPoints + Math.floor(Math.random() * 100) + 50
            };
        }
    }
    
    // 顯示下一名（如果不是最後一名）
    if (myRank.rank < 1000) { // 假設最多1000名
        // 嘗試從排行榜中找到下一名
        if (leaderboard && leaderboard.length >= myRank.rank) {
            nextUser = {
                ...leaderboard[myRank.rank],
                rank: myRank.rank + 1
            };
        } else {
            // 如果排行榜中沒有，創建一個佔位符
            nextUser = {
                rank: myRank.rank + 1,
                lineName: '下一名用戶',
                fbName: '下一名用戶',
                currentPoints: Math.max(0, myRank.currentPoints - Math.floor(Math.random() * 100) - 10)
            };
        }
    }
    
    // 顯示前一名
    if (prevUser) {
        html += `<div class="neighbor-rank-card prev-rank">
            ${createRankCard(prevUser, false, true)}
            <div class="rank-difference">
                領先您 ${((prevUser.currentPoints || 0) - (myRank.currentPoints || 0)).toLocaleString()} 點
            </div>
        </div>`;
    }
    
    // 顯示我的排名
    html += `<div class="my-rank-main">
        ${createRankCard(myRank, true)}
    </div>`;
    
    // 顯示下一名
    if (nextUser) {
        html += `<div class="neighbor-rank-card next-rank">
            ${createRankCard(nextUser, false, true)}
            <div class="rank-difference">
                您領先 ${((myRank.currentPoints || 0) - (nextUser.currentPoints || 0)).toLocaleString()} 點
            </div>
        </div>`;
    }
    
    return html;
}

// 建立排名卡片
function createRankCard(user, isMyRank = false, isNeighbor = false) {
    const rank = user.rank;
    
    // 安全的名稱處理，避免 undefined 錯誤
    let displayName = '無名用戶';
    if (user.lineName && typeof user.lineName === 'string' && user.lineName.length > 0) {
        displayName = `${user.lineName.charAt(0)}xx`;
    } else if (user.fbName && typeof user.fbName === 'string' && user.fbName.length > 0) {
        displayName = `${user.fbName.charAt(0)}xx`;
    }
    
    let rankClass = '';
    let rankNumberClass = '';
    let rankIcon = '';
    
    if (isMyRank) {
        rankClass = 'my-rank my-rank-highlight';
    } else if (isNeighbor) {
        rankClass = 'neighbor-rank';
    } else if (rank <= 3) {
        rankClass = `top-3 rank-${rank}`;
    }
    
    if (rank === 1) {
        rankNumberClass = 'rank-1';
        rankIcon = '<i class="bi bi-crown-fill rank-icon crown"></i>';
    } else if (rank === 2) {
        rankNumberClass = 'rank-2';
        rankIcon = '<i class="bi bi-award-fill rank-icon medal-silver"></i>';
    } else if (rank === 3) {
        rankNumberClass = 'rank-3';
        rankIcon = '<i class="bi bi-award-fill rank-icon medal-bronze"></i>';
    }
    
    return `
        <div class="rank-card ${rankClass}">
            <div class="rank-info">
                <div class="rank-number ${rankNumberClass}">
                    ${rank}
                </div>
                <div class="user-info-rank">
                    <div class="user-name ${isMyRank ? 'my-name' : ''}">
                        ${rankIcon}${displayName}
                    </div>
                    <div class="user-details">
                        ${isMyRank ? '這是您的排名' : `第 ${rank} 名`}
                    </div>
                </div>
            </div>
            <div class="points-info">
                <div class="points-amount ${isMyRank ? 'my-points' : ''}">
                    ${(user.currentPoints || 0).toLocaleString()}
                </div>
                <div class="points-label">點</div>
            </div>
        </div>
    `;
}

// 開啟外部連結
function openExternalLink(url) {
    if (liff.isInClient()) {
        liff.openWindow({
            url: url,
            external: true
        });
    } else {
        window.open(url, '_blank');
    }
}

// 重新整理當前頁面 - 統一管理器版本


// ========== 抽獎系統相關函數 ==========

// 載入抽獎頁面
async function loadLotteryPage() {
    // 防止重複載入
    if (loadLotteryPage.loading) {
        console.log('⚠️ 抽獎頁面正在載入中，跳過重複請求');
        return;
    }
    loadLotteryPage.loading = true;
    
    const lotteryContainer = document.getElementById('lotteryContainer');
    const prizesContainer = document.getElementById('lotteryPrizesContainer');
    
    // 先檢查快取
    const cachedPrizes = SmartCacheManager.smartGet('lotteryPrizes', 'static');
    const cachedTickets = SmartCacheManager.smartGet('lotteryTickets', 'critical');
    const cachedQuantity = SmartCacheManager.smartGet('lotteryQuantity', 'critical');
    
    if (cachedPrizes) {
        // 使用快取的基本獎項資料
        displayLotteryPrizes(cachedPrizes);
        generateSimpleLotteryGrid(cachedPrizes);
        
        // 如果有快取的數量資料，使用它
        if (cachedQuantity) {
            // 更新獎項數量顯示
            const updatedPrizes = cachedPrizes.map(prize => {
                const updatedPrize = cachedQuantity.find(p => p.id === prize.id);
                return updatedPrize ? { ...prize, remainingQuantity: updatedPrize.remainingQuantity } : prize;
            });
            displayLotteryPrizes(updatedPrizes);
        }
        
        // 如果有快取的抽獎券資料，使用它
        if (cachedTickets) {
            displayLotteryTickets(cachedTickets.currentTickets);
        }
        
        // 在背景更新數量資訊
        setTimeout(async () => {
            try {
                const [ticketsResponse, prizesResponse] = await Promise.all([
                    fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`),
                    fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${liff.getAccessToken()}`)
                ]);
                
                const [ticketsResult, prizesResult] = await Promise.all([
                    ticketsResponse.json(),
                    prizesResponse.json()
                ]);
                
                if (ticketsResult.success) {
                    SmartCacheManager.smartSet('lotteryTickets', ticketsResult.data, 'critical');
                    if (!cachedTickets || ticketsResult.data.currentTickets !== cachedTickets.currentTickets) {
                        displayLotteryTickets(ticketsResult.data.currentTickets);
                    }
                }
                
                if (prizesResult.success) {
                    // 更新靜態獎項資料（如果有變化）
                    const hasBasicDataChanged = !cachedPrizes || prizesResult.data.some((prize, index) => 
                        prize.name !== cachedPrizes[index].name || 
                        prize.description !== cachedPrizes[index].description ||
                        prize.image !== cachedPrizes[index].image
                    );
                    
                    if (hasBasicDataChanged) {
                        SmartCacheManager.smartSet('lotteryPrizes', prizesResult.data, 'static');
                        generateSimpleLotteryGrid(prizesResult.data);
                    }
                    
                    // 更新數量資訊
                    const quantityData = prizesResult.data.map(prize => ({
                        id: prize.id,
                        remainingQuantity: prize.remainingQuantity
                    }));
                    SmartCacheManager.smartSet('lotteryQuantity', quantityData, 'critical');
                    
                    // 更新顯示
                    const updatedPrizes = cachedPrizes.map(prize => {
                        const updatedPrize = prizesResult.data.find(p => p.id === prize.id);
                        return updatedPrize ? { ...prize, remainingQuantity: updatedPrize.remainingQuantity } : prize;
                    });
                    displayLotteryPrizes(updatedPrizes);
                }
            } catch (error) {
                console.warn('背景更新抽獎資料失敗:', error);
            }
        }, 100);
        
        return;
    }
    
    // 沒有快取時顯示載入畫面
    if (prizesContainer) {
        prizesContainer.innerHTML = `
            <div class="loading">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
            </div>
        `;
    }
    
    try {
        const accessToken = liff.getAccessToken();
        const [ticketsResponse, prizesResponse] = await Promise.all([
            fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${accessToken}`),
            fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${accessToken}`)
        ]);
        
        const [ticketsResult, prizesResult] = await Promise.all([
            ticketsResponse.json(),
            prizesResponse.json()
        ]);
        
        if (ticketsResult.success) {
            SmartCacheManager.smartSet('lotteryTickets', ticketsResult.data, 'critical');
            displayLotteryTickets(ticketsResult.data.currentTickets);
        }
        
        if (prizesResult.success) {
            // 儲存完整獎項資料作為靜態快取
            SmartCacheManager.smartSet('lotteryPrizes', prizesResult.data, 'static');
            
            // 儲存數量資訊作為即時快取
            const quantityData = prizesResult.data.map(prize => ({
                id: prize.id,
                remainingQuantity: prize.remainingQuantity
            }));
            SmartCacheManager.smartSet('lotteryQuantity', quantityData, 'critical');
            
            displayLotteryPrizes(prizesResult.data);
            generateSimpleLotteryGrid(prizesResult.data);
        } else {
            if (prizesContainer) {
                prizesContainer.innerHTML = `
                    <div class="error-message">
                        <i class="bi bi-exclamation-triangle"></i>
                        <h5>載入失敗</h5>
                        <p>${prizesResult.error || '載入獎項失敗'}</p>
                        <button class="btn btn-primary" onclick="loadLotteryPage()">
                            <i class="bi bi-arrow-clockwise"></i> 重新載入
                        </button>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('❌ 載入抽獎頁面失敗:', error);
        if (prizesContainer) {
            prizesContainer.innerHTML = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>網路錯誤</h5>
                    <p>無法連接到伺服器，請檢查網路連線</p>
                    <p class="small">錯誤詳情: ${error.message}</p>
                    <button class="btn btn-primary" onclick="loadLotteryPage()">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
        }
        if (ticketsDisplay) {
            ticketsDisplay.innerHTML = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <p>網路連接錯誤</p>
                </div>
            `;
        }
    }
    
    console.log('=== 抽獎頁面載入完成 ===');
    loadLotteryPage.loading = false;
}

// 顯示抽獎券數量
function displayLotteryTickets(tickets) {
    // 🔧 確保抽獎券是數字，處理可能的物件輸入
    let ticketsValue = 0;
    
    if (typeof tickets === 'number') {
        ticketsValue = tickets;
    } else if (typeof tickets === 'object' && tickets !== null) {
        // 如果是物件，嘗試提取 currentTickets 或 tickets 屬性
        ticketsValue = tickets.currentTickets || tickets.tickets || 0;
    } else if (typeof tickets === 'string') {
        ticketsValue = parseInt(tickets) || 0;
    }
    
    // 只更新header顯示
    const headerTickets = document.getElementById('headerLotteryTickets');
    if (headerTickets) {
        headerTickets.textContent = ticketsValue.toString();
    }
}

// 顯示獎項列表
function displayLotteryPrizes(prizes) {
    const prizesContainer = document.getElementById('lotteryPrizesContainer');
    
    if (!prizesContainer) {
        return;
    }
    
    if (!prizes || prizes.length === 0) {
        prizesContainer.innerHTML = '<div class="no-prizes">目前沒有可抽取的獎項</div>';
        return;
    }
    
    // 按資料庫順序排序，謝謝參加除外
    const sortedPrizes = prizes.filter(p => p.id !== 'THANKS');
    const thanksItem = prizes.find(p => p.id === 'THANKS');
    
    let prizesHTML = '';
    
    // 顯示真正的獎項
    sortedPrizes.forEach((prize, index) => {
        prizesHTML += `
            <div class="prize-card">
                <div class="prize-header">
                    <h5 class="prize-name">${prize.name}</h5>
                </div>
                <p class="prize-description">${prize.description}</p>
                <div class="prize-stock">
                    <i class="bi bi-box"></i> 剩餘: ${prize.remainingQuantity}
                </div>
            </div>
        `;
    });
    
    // 顯示謝謝參加
    if (thanksItem) {
        prizesHTML += `
            <div class="prize-card thanks-card">
                <div class="prize-header">
                    <h5 class="prize-name">${thanksItem.name}</h5>
                </div>
                <p class="prize-description">${thanksItem.description}</p>
            </div>
        `;
    }
    
    prizesContainer.innerHTML = prizesHTML;
}

// 執行抽獎
async function drawLottery() {
    if (!currentUser || !currentUser.userId) {
        showAlert('請先登入', 'warning');
        return;
    }

    // 先檢查按鈕狀態
    const drawButton = document.getElementById('drawLotteryBtn');
    if (drawButton && drawButton.disabled) {
        return;
    }

    // 🔒 防重複請求檢查
    const lockKey = `lottery_${currentUser.userId}`;
    if (RequestLockManager.isLocked(lockKey)) {
        // 強制解鎖之前的請求
        RequestLockManager.unlock(lockKey);
    }

    try {
        // 使用權威數據獲取抽獎券數量
        let currentTickets = UserDataManager.authoritative.lotteryTickets;
        
        // 如果沒有權威數據，則從API獲取
        if (currentTickets === null || currentTickets === undefined) {
            const response = await fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
            const result = await response.json();
            
            if (!result.success || !result.data || result.data.currentTickets < 1) {
                showAlert('抽獎券不足，無法抽獎', 'warning');
                return;
            }
            
            // 設置權威數據
            currentTickets = result.data.currentTickets;
            UserDataManager.setAuthoritative('lotteryTickets', currentTickets, 'drawLottery');
        }
        
        if (!currentTickets || currentTickets < 1) {
            showAlert('抽獎券不足，無法抽獎', 'warning');
            return;
        }

        // 立即扣除抽獎券（樂觀更新）
        UserDataManager.setAuthoritative('lotteryTickets', currentTickets - 1, '抽獎扣除');
        UserDataManager.updateUI('lotteryTickets', currentTickets - 1);

        // 🔒 鎖定請求
        RequestLockManager.lock(lockKey);
        
        const drawButton = document.getElementById('drawLotteryBtn');
        
        if (drawButton) {
            drawButton.disabled = true;
            drawButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>抽獎中...';
        }
        
        // 完全重置所有效果
        const allGridItems = document.querySelectorAll('.grid-item:not(.center)');
        allGridItems.forEach(item => {
            item.classList.remove('running', 'winner', 'active', 'highlight', 'selected');
            item.style.transition = 'none';
        });
        
        // 檢查九宮格是否已生成，沒有才重新生成
        const existingGrid = document.querySelectorAll('.grid-item:not(.center)');
        if (existingGrid.length === 0) {
            const prizesResponse = await fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${liff.getAccessToken()}`);
            const prizesResult = await prizesResponse.json();
            
            if (prizesResult.success) {
                generateSimpleLotteryGrid(prizesResult.data);
            }
        }
        
        // 創建動畫控制器
        const animationController = {
            shouldStop: false,
            targetPosition: null,
            finalResult: null
        };
    
    // 保存當前動畫控制器到全局變量
    window.currentAnimationController = animationController;
        
        // 立即開始跑燈動畫（無限循環直到收到停止信號）
        const animationPromise = runLotteryAnimationWithControl(animationController);
        
        // 同時發送API請求
        const apiPromise = fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=drawLottery&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
        }).then(response => response.json());
        
        // 等待API結果
        const apiResult = await apiPromise;
        
        if (apiResult.success) {
            if (apiResult.data.isOutOfStock) {
                // 獎項庫存不足，但仍要讓轉盤停在該獎項位置
                const targetPosition = findWinnerPosition(apiResult.data.prizeId);
                
                // 設定停止參數
                animationController.shouldStop = true;
                animationController.targetPosition = targetPosition;
                animationController.finalResult = apiResult.data;
                
                // 等待動畫完成
                await animationPromise;
                
                // 恢復抽獎券（庫存不足不扣除）
                UserDataManager.setAuthoritative('lotteryTickets', currentTickets, '庫存不足恢復');
                UserDataManager.updateUI('lotteryTickets', currentTickets);

                // 顯示無庫存結果
                showLotteryResult(apiResult.data);
                return;
            }
            
            // 獲取獎項ID
            const prizeId = apiResult.data.prizeId;
            if (!prizeId) {
                console.error('❌ 無法獲取獎項ID:', apiResult);
                throw new Error('無法獲取獎項ID');
            }
            
            const targetPosition = findWinnerPosition(prizeId);
            
            // 設定停止參數
            animationController.shouldStop = true;
            animationController.targetPosition = targetPosition;
            animationController.finalResult = apiResult.data;
        } else {
            // API失敗，隨機停止
            animationController.shouldStop = true;
            animationController.targetPosition = -1;
        }
        
        // 等待動畫完成
        await animationPromise;
        
        if (apiResult.success) {
            // 驗證最終結果
            const finalPosition = getCurrentWinnerPosition();
            const finalPrizeId = getFinalPrizeId(finalPosition);
            
            // 獲取預期獎項ID
            const expectedPrizeId = apiResult.data.prizeId;
            if (!expectedPrizeId) {
                console.error('❌ 無法獲取預期獎項ID:', apiResult);
                throw new Error('無法獲取預期獎項ID');
            }
            
            // 統一轉換為字串進行比對
            if (String(finalPrizeId) !== String(expectedPrizeId)) {
                setCorrectWinnerDisplay(expectedPrizeId);
            }
            
            // 立即顯示結果
            showLotteryResult(apiResult.data);

            // 立即更新抽獎券數量
            UserDataManager.setAuthoritative('lotteryTickets', apiResult.data.remainingTickets, '抽獎結果');
            UserDataManager.updateUI('lotteryTickets', apiResult.data.remainingTickets);

            // 立即處理中獎邏輯
            if (!apiResult.data.isThanks) {
                await handlePrizeExchange(apiResult.data);
            }

            // 立即更新所有相關數據
            await SmartBackgroundUpdate.updateQuantityData();
            await instantUpdate.updateExchangedData(true);
            await instantUpdate.updateUnusedProductsCount(null, true);
            
        } else {
            // API失敗，恢復抽獎券
            UserDataManager.setAuthoritative('lotteryTickets', currentTickets, '抽獎失敗恢復');
            UserDataManager.updateUI('lotteryTickets', currentTickets);
            showAlert(apiResult.error || '抽獎失敗', 'danger');
        }
        
    } catch (error) {
        console.error('抽獎失敗:', error);
        // 錯誤時也要恢復抽獎券
        UserDataManager.setAuthoritative('lotteryTickets', currentTickets, '抽獎錯誤恢復');
        UserDataManager.updateUI('lotteryTickets', currentTickets);
        showAlert('抽獎失敗，請稍後再試', 'danger');
    } finally {
        // 🔓 立即解鎖請求並恢復按鈕
        RequestLockManager.unlock(lockKey);
        
        const drawButton = document.getElementById('drawLotteryBtn');
        if (drawButton) {
            drawButton.disabled = false;
            drawButton.innerHTML = '<i class="bi bi-gift"></i> 開始抽獎';
        }
    }
}

// 順時鐘九宮格生成
function generateSimpleLotteryGrid(prizes) {
    const lotteryGrid = document.getElementById('lotteryGrid');
    if (!lotteryGrid) return;
    
    // 檢查九宮格是否已經生成且有效
    const existingGrid = document.querySelectorAll('#lotteryGrid .grid-item:not(.center)');
    if (existingGrid.length === 8) {
        return;
    }
    
    // 先嘗試使用預生成的配置
    const preGeneratedConfig = cache.get('preGeneratedLotteryGrid');
    if (preGeneratedConfig && JSON.stringify(preGeneratedConfig.prizes) === JSON.stringify(prizes)) {
        renderLotteryGridFromConfig(preGeneratedConfig, lotteryGrid);
        return;
    }
    
    // 順時鐘HTML位置映射
    // 九宮格布局:    順時鐘順序:
    // 0 1 2         0 → 1 → 2
    // 3 4 5    =>   ↑   X   ↓  (4是中心，X表示跳過)
    // 6 7 8         7 ← 6 ← 5
    //               
    // 順時鐘HTML位置: [0, 1, 2, 5, 8, 7, 6, 3]
    const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3]; // HTML索引的順時鐘順序（跳過中心位置4）
    
    // 分配獎項到8個位置
    const positionToPrize = {};
    const totalPositions = 8;
    
    if (prizes.length === 0) {
        console.log('❌ 沒有獎項');
        lotteryGrid.innerHTML = '<div class="grid-item center">暫無獎項</div>';
        return;
    }
    
    // 直接使用所有獎項，不進行智能填充
    for (let i = 0; i < Math.min(prizes.length, totalPositions); i++) {
        positionToPrize[i] = prizes[i];
        console.log(`  位置 ${i} ← ${prizes[i].name} (${prizes[i].id})`);
    }
    
    let gridHTML = '';
    
    // 生成9個格子
    for (let htmlIndex = 0; htmlIndex < 9; htmlIndex++) {
        if (htmlIndex === 4) {
            // 中心位置空白
            gridHTML += '<div class="grid-item center"></div>';
        } else {
            // 找到此HTML位置在順時鐘順序中的位置
            const clockwisePos = clockwiseOrder.indexOf(htmlIndex);
            
            if (clockwisePos === -1) {
                continue;
            }
            
            const prize = positionToPrize[clockwisePos];
            
            if (!prize) {
                continue;
            }
            
            gridHTML += `
                <div class="grid-item" data-prize-id="${prize.id}" data-clockwise-pos="${clockwisePos}">
                    ${prize.name}
                </div>
            `;
        }
    }
    
    lotteryGrid.innerHTML = gridHTML;
    
    // 保存配置
    window.clockwiseOrder = clockwiseOrder;
    window.lotteryPrizes = prizes;
    window.positionToPrize = positionToPrize;
}

// 查找順時鐘中獎位置
function findWinnerPosition(prizeId) {
    const clockwiseOrder = window.clockwiseOrder || [0, 1, 2, 5, 8, 7, 6, 3];
    const targetId = String(prizeId);
    
    // 只使用獎項ID進行比對
    for (let clockwisePos = 0; clockwisePos < clockwiseOrder.length; clockwisePos++) {
        const htmlIndex = clockwiseOrder[clockwisePos];
        const gridItem = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
        
        if (gridItem && !gridItem.classList.contains('center')) {
            const currentId = String(gridItem.dataset.prizeId);
            if (currentId === targetId) {
                return clockwisePos;
            }
        }
    }
    
    // 如果找不到，返回第一個位置
    console.warn(`❌ 找不到獎項ID ${targetId}，使用預設位置 0`);
    return 0;
}

// 順時鐘快速跑燈動畫
// 精確的順時鐘跑燈動畫
async function runLotteryAnimation(targetPosition) {
    return new Promise((resolve) => {
        const clockwiseOrder = window.clockwiseOrder || [0, 1, 2, 5, 8, 7, 6, 3];
        
        let currentPos = 0;  // 從位置0開始
        let steps = 0;
        const minSteps = 16;  // 最少跑2圈
        const fastSpeed = 120;  // 快速度
        const slowSpeed = 250; // 減速時的速度
        
        console.log(`🎰 開始順時鐘跑燈，目標位置: ${targetPosition}`);
        console.log(`順時鐘順序: [${clockwiseOrder.join(', ')}]`);
        
        function animate() {
            steps++;
            
            // 清除所有跑燈效果
            document.querySelectorAll('.grid-item').forEach(item => {
                item.classList.remove('running');
            });
            
            // 根據順時鐘位置添加跑燈效果
            const htmlIndex = clockwiseOrder[currentPos];
            const currentElement = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
            
            if (currentElement) {
                currentElement.classList.add('running');
                console.log(`跑燈步驟 ${steps}: 順時鐘位置 ${currentPos} → HTML索引 ${htmlIndex}`);
            }
            
            // 決定是否停止和下一步速度
            let shouldStop = false;
            let nextSpeed = fastSpeed;
            
            if (steps >= minSteps && targetPosition >= 0) {
                // 檢查是否到達目標位置
                if (currentPos === targetPosition) {
                    shouldStop = true;
                    console.log(`🎯 到達順時鐘目標位置 ${targetPosition}，停止！`);
                } else {
                    // 計算距離目標的步數
                    const stepsToTarget = (targetPosition - currentPos + clockwiseOrder.length) % clockwiseOrder.length;
                    if (stepsToTarget <= 3 && stepsToTarget > 0) {
                        nextSpeed = slowSpeed;
                        console.log(`🐌 接近目標，減速！距離目標 ${stepsToTarget} 步`);
                    }
                }
            } else if (targetPosition < 0 && steps >= 20) {
                // 無目標時隨機停止
                if (Math.random() < 0.3) {
                    shouldStop = true;
                    console.log(`🎲 隨機停止在順時鐘位置 ${currentPos}`);
                }
            }
            
            if (shouldStop) {
                // 最終停止，清除跑燈效果並添加中獎效果
                document.querySelectorAll('.grid-item').forEach(item => {
                    item.classList.remove('running');
                });
                
                const finalHtmlIndex = clockwiseOrder[currentPos];
                const winnerElement = document.querySelector(`#lotteryGrid .grid-item:nth-child(${finalHtmlIndex + 1})`);
                
                if (winnerElement) {
                    winnerElement.classList.add('winner');
                    const prizeId = winnerElement.dataset.prizeId;
                    const content = winnerElement.textContent.trim();
                    console.log(`🎉 最終停在順時鐘位置 ${currentPos} (HTML: ${finalHtmlIndex}): ${content} (${prizeId})`);
                    
                    // 驗證結果
                    if (targetPosition >= 0) {
                        if (currentPos === targetPosition) {
                            console.log(`✅ 位置完全正確！`);
                        } else {
                            console.log(`❌ 位置錯誤！目標: ${targetPosition}, 實際: ${currentPos}`);
                        }
                    }
                }
                
                resolve();
            } else {
                // 移動到下一個順時鐘位置
                currentPos = (currentPos + 1) % clockwiseOrder.length;
                setTimeout(animate, nextSpeed);
            }
        }
        
        // 立即開始動畫
        requestAnimationFrame(animate);
    });
}

// 處理獎項自動兌換（背景處理，不阻塞UI）
async function handlePrizeExchange(prizeData) {
    try {
        console.log('🔄 開始背景處理獎項兌換:', prizeData);
        
        if (!currentUser || !currentUser.userId) {
            console.error('❌ 無法處理獎項兌換：用戶未登入');
            return;
        }
        
        // 背景調用後端API，將中獎獎項自動兌換為商品
        console.log('📡 發送兌換API請求...');
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'convertPrizeToProduct',
                userId: currentUser.userId,
                prizeId: prizeData.prizeId,
                drawId: prizeData.drawId,
                accessToken: liff.getAccessToken()
            })
        });
        
        console.log('📡 API回應狀態:', response.status);
        
        if (!response.ok) {
            throw new Error(`API請求失敗: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📡 API回應結果:', result);
        
        if (result.success) {
            console.log('✅ 獎項兌換成功，開始更新數據');
            
            // 清除相關頁面數據快取
            UserDataManager.clearPageData('exchangedProducts');
            UserDataManager.clearPageData('lotteryHistory');
            UserDataManager.clearPageData('lotteryPrizes');
            
            // 🔥 立即更新兌換商品數據和頂部數量
            console.log('🔄 開始獲取最新兌換商品數據...');
            try {
                const exchangedResponse = await fetch(API_BASE_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`
                });
                
                console.log('📡 兌換商品API回應狀態:', exchangedResponse.status);
                
                if (!exchangedResponse.ok) {
                    throw new Error(`獲取兌換商品失敗: ${exchangedResponse.status}`);
                }
                
                const exchangedResult = await exchangedResponse.json();
                console.log('📡 兌換商品API回應結果:', exchangedResult);
                
                if (exchangedResult.success) {
                    // 計算待使用商品數量
                    const now = new Date();
                    const unusedCount = exchangedResult.data.filter(product => {
                        const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                        const isUseExpired = product.useExpirationDate && new Date(product.useExpirationDate) < now;
                        return product.status === '未使用' && !isExpired && !isUseExpired && !product.isExpired;
                    }).length;
                    
                    // 💾 緩存兌換商品數據
                    cache.set('exchangedResult', exchangedResult, 300000);
                    
                    // 🔄 總是更新兌換商品列表，這會同時更新權威數據和UI
                    displayExchangedProducts(exchangedResult.data);
                    
                    // 📊 額外確保頂部UI更新
                    UserDataManager.updateUI('unusedProductsCount', unusedCount);
                    
                    console.log('📊 中獎後兌換商品數量已更新:', unusedCount);
                    console.log('🔄 兌換商品列表和頂部UI已強制更新');
                }
            } catch (error) {
                console.error('更新兌換商品資料失敗:', error);
            }
            
            // 立即更新所有用戶資料
            await UserDataManager.updateAll('獎項兌換即時更新', {
                updateLottery: true,
                updateRecords: true
            });
            
            // 給用戶一個輕微的成功提示（如果中獎彈窗還在顯示）
            const resultModal = document.getElementById('lotteryResultModal');
            if (resultModal && resultModal.style.display === 'flex') {
                const claimNotice = resultModal.querySelector('.claim-notice');
                if (claimNotice) {
                    claimNotice.innerHTML = `
                        <i class="bi bi-check-circle-fill"></i>
                        獎品已成功匯入，請至「已兌換商品」查看
                    `;
                    claimNotice.style.background = 'rgba(34, 197, 94, 0.15)';
                    claimNotice.style.color = '#16a34a';
                }
            }
            
        } else {
            console.error('❌ 獎項兌換失敗:', result.error || '未知錯誤');
        }
        
    } catch (error) {
        console.error('❌ 處理獎項兌換時發生錯誤:', error);
    }
}

// 顯示抽獎結果彈窗
function showLotteryResult(result) {
    const resultModal = document.getElementById('lotteryResultModal');
    const resultContent = document.getElementById('lotteryResultContent');
    
    if (!resultModal || !resultContent) return;
    
    // 強制解鎖所有抽獎相關的鎖
    if (currentUser && currentUser.userId) {
        RequestLockManager.unlock(`lottery_${currentUser.userId}`);
    }
    
    // 確保抽獎按鈕可以立即使用
    const drawButton = document.getElementById('drawLotteryBtn');
    if (drawButton) {
        drawButton.disabled = false;
        drawButton.innerHTML = '<i class="bi bi-gift"></i> 開始抽獎';
    }
    
    // 重置所有動畫相關的狀態
    window.currentAnimationController = null;
    
    let resultHTML = '';
    let modalClass = '';
    
    if (result.isOutOfStock) {
        // 獎項已兌換完畢
        modalClass = 'out-of-stock-modal';
        resultHTML = `
            <div class="lottery-result out-of-stock-result">
                <div class="result-icon out-of-stock-icon">
                    <i class="bi bi-exclamation-circle"></i>
                </div>
                <h3 class="result-title">很抱歉<br>${result.prizeName} 已兌換完畢！</h3>
                <p class="result-description">抽獎券沒有扣除，可再抽一次</p>
                <div class="remaining-tickets">
                    <i class="bi bi-ticket-perforated"></i>
                    剩餘抽獎券: ${result.currentTickets} 張
                </div>
            </div>
        `;
    } else if (result.isThanks) {
        // 謝謝參加
        modalClass = 'thanks-modal';
        resultHTML = `
            <div class="lottery-result thanks-result">
                <div class="result-icon thanks-icon">
                    <i class="bi bi-heart"></i>
                </div>
                <h3 class="result-title">謝謝參加</h3>
                <p class="result-description">感謝您的參與，下次再來挑戰吧！</p>
                <div class="remaining-tickets">
                    <i class="bi bi-ticket-perforated"></i>
                    剩餘抽獎券: ${result.remainingTickets} 張
                </div>
            </div>
        `;
    } else {
        // 中獎了
        modalClass = 'winner-modal';
        resultHTML = `
            <div class="lottery-result winner-result">
                <div class="result-icon winner-icon">
                    <i class="bi bi-trophy-fill"></i>
                </div>
                <h3 class="result-title">🎉 恭喜中獎！</h3>
                <div class="prize-info">
                    <h4 class="prize-name">${result.prizeName}</h4>
                    <p class="prize-description">${result.description}</p>
                    <p class="prize-expiry">使用期限：${(() => {
                        const expiry = new Date();
                        expiry.setDate(expiry.getDate() + 13); // 改為13天，因為要算當天
                        expiry.setHours(23, 59, 59, 999);
                        return formatDateTime(expiry);
                    })()}</p>
                </div>
                <div class="remaining-tickets">
                    <i class="bi bi-ticket-perforated"></i>
                    剩餘抽獎券: ${result.remainingTickets} 張
                </div>
                <div class="claim-notice">
                    <i class="bi bi-check-circle-fill"></i>
                    獎品正在處理中，稍後可至「已兌換商品」查看
                </div>
            </div>
        `;
    }
    
    // 添加統一的關閉按鈕
    resultHTML += `
        <button class="lottery-close-btn" onclick="closeLotteryResult()">
            <i class="bi bi-x-lg"></i> 關閉
        </button>
    `;
    
    resultContent.innerHTML = resultHTML;
    resultModal.className = `lottery-modal ${modalClass}`;
    resultModal.style.display = 'flex';
    
    // 立即播放動畫效果
    setTimeout(() => {
    resultModal.classList.add('show');
    }, 0);
}

// 關閉抽獎結果彈窗
function closeLotteryResult() {
    const resultModal = document.getElementById('lotteryResultModal');
    if (resultModal) {
        // 立即停止所有動畫
        if (window.currentAnimationController) {
            window.currentAnimationController.shouldStop = true;
            window.currentAnimationController.forceStop = true; // 強制立即停止
        }
        
        // 只清除動畫相關效果，保留中獎標記
        const allGridItems = document.querySelectorAll('.grid-item');
        allGridItems.forEach(item => {
            item.classList.remove('running');
            // 移除動畫相關的class
            item.style.transition = 'none';
            item.classList.remove('active', 'highlight', 'selected');
        });
        
        // 重置抽獎按鈕狀態
        const drawButton = document.getElementById('drawLotteryBtn');
        if (drawButton) {
            drawButton.disabled = false;
            drawButton.innerHTML = '<i class="bi bi-gift"></i> 開始抽獎';
        }
        
        // 關閉彈窗
        resultModal.classList.remove('show');
            resultModal.style.display = 'none';
        
        // 關閉彈窗時觸發一次背景更新（但不包含記錄頁面）
        setTimeout(async () => {
            await instantUpdate.updateUserData(true);
        }, 200);
    }
}

// 載入抽獎歷史
async function loadLotteryHistory() {
    const historyList = document.getElementById('lotteryHistoryList');
    
    // 🔥 強制重新載入，不使用快取，確保顯示最新記錄
    // 顯示載入畫面
    historyList.innerHTML = `
        <div class="loading">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">載入中...</span>
            </div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            cache.set('lotteryHistory', result.data, 7200000); // 靜態模式：2小時快取
            displayLotteryHistory(result.data.records, result.data.currentTickets);
        } else {
            historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有抽獎紀錄</div>';
        }
    } catch (error) {
        historyList.innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>載入失敗</h5>
                <p>無法載入抽獎紀錄，請稍後再試</p>
                <button class="btn btn-primary" onclick="loadLotteryHistory()">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
    }
}

// 顯示抽獎歷史
function displayLotteryHistory(historyData, currentTickets) {
    const historyList = document.getElementById('lotteryHistoryList');
    
    if (!historyList) return;
    
    if (historyData && historyData.length > 0) {
        let html = '';
        
        // 如果有超過30筆記錄，顯示額外說明
        const totalRecords = historyData.length;
        if (totalRecords > 30) {
            html += `
                <div class="text-center mb-3">
                    <small class="text-muted">
                        <i class="bi bi-info-circle"></i> 
                        共 ${totalRecords} 筆記錄，僅顯示最近 30 筆
                    </small>
                </div>
            `;
        }
        
        html += historyData.map(item => {
            if (item.type === 'draw') {
                // 抽獎記錄
                let statusClass, statusIcon, statusText;
                
                if (item.prizeId === 'THANKS') {
                    statusClass = 'status-thanks';
                    statusIcon = 'bi-heart';
                    statusText = '謝謝參加';
                } else if (item.claimStatus === '已領取') {
                    statusClass = 'status-claimed';
                    statusIcon = 'bi-check-circle-fill';
                    statusText = '已領取';
                } else {
                    statusClass = 'status-pending';
                    statusIcon = 'bi-gift-fill';
                    statusText = '待領取';
                }
                
                return `
                    <div class="lottery-history-item">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="history-content">
                                <div class="prize-info">
                                    <h6 class="prize-name ${item.prizeId === 'THANKS' ? 'thanks-name' : 'winner-name'}">
                                        ${item.prizeName}
                                    </h6>
                                    <span class="draw-status ${statusClass}">
                                        </span>
                                </div>
                                <div class="draw-time text-muted small">
                                    <i class="bi bi-clock"></i> ${formatDateTime(item.time)}
                                </div>
                                ${item.claimTime ? 
                                    `<div class="claim-time text-muted small">
                                        <i class="bi bi-check2"></i> 領取時間：${formatDateTime(item.claimTime)}
                                    </div>` : ''
                                }
                            </div>
                        </div>
                    </div>
                `;
            } else if (item.type === 'ticket') {
                // 抽獎券異動記錄
                const isPositive = item.isPositive;
                const itemClass = isPositive ? 'ticket-item ticket-gain' : 'ticket-item ticket-use';
                const iconClass = isPositive ? 'bi-plus-circle text-success' : 'bi-dash-circle text-danger';
                const titleClass = isPositive ? 'text-success' : 'text-danger';
                
                return `
                    <div class="lottery-history-item ${itemClass}">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="history-content">
                                <div class="ticket-info">
                                    <h6 class="ticket-title">
                                        <i class="bi ${iconClass}"></i>
                                        <span class="${titleClass}">${item.title}</span>
                                    </h6>
                                    <p class="ticket-description">${item.description}</p>
                                    ${item.relatedName ? `<p class="related-name text-muted small">來源：${item.relatedName}</p>` : ''}
                                </div>
                                <div class="ticket-time text-muted small">
                                    <i class="bi bi-clock"></i> ${formatDateTime(item.time)}
                                </div>
                            </div>
                            <div class="ticket-balance">
                                <div class="balance-info text-end">
                                    <div class="change-amount ${isPositive ? 'text-success' : 'text-danger'} fw-bold small">
                                        ${isPositive ? '+' : ''}${Number(item.changeAmount) || 0}
                                    </div>
                                    <div class="balance-amount text-primary fw-bold">
                                        ${Number(item.ticketsBalance) || 0} 張
                                    </div>
                                    <div class="balance-label text-muted small">
                                        餘額
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('');
        
        historyList.innerHTML = html;
    } else {
        historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有抽獎紀錄</div>';
    }
}

// 重新整理抽獎頁面
async function refreshLotteryPage() {
    // 使用新的即時更新系統
    await instantUpdate.updateLotteryData(false);
    showAlert('重新整理完成', 'success');
}



// 舊的九宮格函數已刪除，使用新的 generateSimpleLotteryGrid

// 計算中獎區塊
function getWinningSection(prizeId, sectionsCount) {
    const wheelSections = document.querySelectorAll('.wheel-section');
    for (let i = 0; i < wheelSections.length; i++) {
        if (wheelSections[i].dataset.prizeId === prizeId) {
            return i;
        }
    }
    return 0; // 預設回到第一個區塊
}

// 檢查URL參數並重定向到指定頁面
function checkUrlParametersAndRedirect() {
    try {
        // 如果已經設置過初始頁面，則不再執行跳轉
        if (initialPageSetupComplete) {
            console.log('📍 頁面已初始化，跳過URL重定向');
            return;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const targetPage = urlParams.get('page');
        
        console.log('檢查URL參數:', { targetPage });
        
        if (targetPage) {
            // 延遲一小段時間確保頁面完全載入
            setTimeout(() => {
                // 再次檢查，確保沒有被其他邏輯搶先設置
                if (initialPageSetupComplete) return;
                
                switch (targetPage) {
                    case 'lottery':
                        console.log('📍 直接跳轉到抽獎頁面');
                        showPage('lotteryPage');
                        break;
                    case 'lotteryHistory':
                        console.log('📍 直接跳轉到記錄查詢頁面（抽獎記錄）');
                        showPage('recordsPage');
                        setTimeout(() => switchRecordsTab('lottery'), 100);
                        break;
                    case 'earn':
                        console.log('📍 直接跳轉到領取點數頁面');
                        showPage('earnPage');
                        break;
                    case 'products':
                        console.log('📍 直接跳轉到商品兌換頁面');
                        showPage('productsPage');
                        break;
                    case 'exchanged':
                        console.log('📍 直接跳轉到已兌換商品頁面');
                        showPage('exchangedPage');
                        break;
                    case 'leaderboard':
                        console.log('📍 直接跳轉到排行榜頁面');
                        showPage('leaderboardPage');
                        break;
                    case 'history':
                        console.log('📍 直接跳轉到記錄查詢頁面（點數記錄）');
                        showPage('recordsPage');
                        setTimeout(() => switchRecordsTab('points'), 100);
                        break;
                    default:
                        console.log('📍 未知頁面參數，保持在首頁');
                        showPage('mainPage');
                        break;
                }
                initialPageSetupComplete = true;
            }, 300);
        } else {
            // 沒有頁面參數，顯示首頁
            console.log('📍 無URL參數，顯示首頁');
            showPage('mainPage');
            initialPageSetupComplete = true;
        }
        
    } catch (error) {
        console.error('URL參數檢查失敗:', error);
        // 出錯時預設顯示首頁
        showPage('mainPage');
        initialPageSetupComplete = true;
    }
}

// 開啟抽獎系統連結
function openLotterySystem() {
    // 創建一個新的抽獎系統連結，這裡假設是另一個URL
    const lotteryURL = 'https://aji945.github.io/LineOA/lottery.html'; // 獨立的抽獎系統
    
    if (liff.isInClient()) {
        liff.openWindow({
            url: lotteryURL,
            external: true
        });
    } else {
        window.open(lotteryURL, '_blank');
    }
}

// 獲取當前中獎位置
function getCurrentWinnerPosition() {
    const winnerElement = document.querySelector('.grid-item.winner');
    if (winnerElement) {
        const clockwisePos = parseInt(winnerElement.dataset.clockwisePos);
        return clockwisePos;
    }
    return -1;
}

// 根據順時鐘位置獲取獎項ID
function getFinalPrizeId(clockwisePos) {
    const clockwiseOrder = window.clockwiseOrder || [0, 1, 2, 5, 8, 7, 6, 3];
    
    if (clockwisePos >= 0 && clockwisePos < clockwiseOrder.length) {
        const htmlIndex = clockwiseOrder[clockwisePos];
        const gridItem = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
        
        if (gridItem && !gridItem.classList.contains('center')) {
            return gridItem.dataset.prizeId;
        }
    }
    
    return null;
}

// 強制設定正確的中獎顯示
function setCorrectWinnerDisplay(correctPrizeId) {
    console.log(`🔧 強制修正中獎顯示為: ${correctPrizeId}`);
    
    // 清除所有中獎效果
    document.querySelectorAll('.grid-item').forEach(item => {
        item.classList.remove('winner', 'running');
    });
    
    // 找到正確的獎項位置並設定中獎效果
    const correctPosition = findWinnerPosition(correctPrizeId);
    if (correctPosition >= 0) {
        const clockwiseOrder = window.clockwiseOrder || [0, 1, 2, 5, 8, 7, 6, 3];
        const htmlIndex = clockwiseOrder[correctPosition];
        const correctElement = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
        
        if (correctElement) {
            correctElement.classList.add('winner');
        }
    }
}

// 帶控制器的跑燈動畫（立即開始，等待控制信號）
async function runLotteryAnimationWithControl(controller) {
    return new Promise((resolve) => {
        const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3]; // 正確的順時鐘順序
        const allGridItems = document.querySelectorAll('.grid-item');
        let currentPos = 0;
        let totalSteps = 0;
        const baseSpeed = 100; // 基礎跑燈速度（毫秒）
        let animationSpeed = baseSpeed;
        
        function tick() {
            // 檢查是否強制停止
            if (controller.forceStop) {
                // 清除所有效果並立即結束
                allGridItems.forEach(item => {
                    item.classList.remove('running', 'winner');
                    item.style.transition = 'none';
                });
                resolve();
                return;
            }
            
            // 清除當前高亮
            allGridItems.forEach(item => item.classList.remove('running'));
            
            // 高亮當前位置 - 使用正確的HTML索引
            const htmlIndex = clockwiseOrder[currentPos];
            const currentElement = allGridItems[htmlIndex];
            if (currentElement && !currentElement.classList.contains('center')) {
                currentElement.classList.add('running');
            }
            
            // 檢查是否收到停止信號
            if (controller.shouldStop && totalSteps >= 16) { // 至少跑2圈才能停
                if (controller.targetPosition >= 0) {
                    // 計算還需要多少步到達目標位置
                    let stepsToTarget = (controller.targetPosition - currentPos + 8) % 8;
                    if (stepsToTarget === 0 && currentPos !== controller.targetPosition) {
                        stepsToTarget = 8; // 完整再跑一圈
                    }
                    
                    // 開始減速停止動畫
                    runStopAnimation(currentPos, controller.targetPosition, stepsToTarget, allGridItems, resolve, controller);
                } else {
                    // 隨機停止
                    const randomTarget = Math.floor(Math.random() * 8);
                    let stepsToTarget = (randomTarget - currentPos + 8) % 8;
                    if (stepsToTarget === 0) stepsToTarget = 8;
                    
                    runStopAnimation(currentPos, randomTarget, stepsToTarget, allGridItems, resolve, controller);
                }
                return;
            }
            
            // 繼續跑燈
            currentPos = (currentPos + 1) % 8;
            totalSteps++;
            
            // 根據跑燈圈數調整速度（前幾圈快一點）
            if (totalSteps < 8) {
                animationSpeed = baseSpeed * 0.8; // 第一圈稍快
            } else if (totalSteps < 16) {
                animationSpeed = baseSpeed; // 第二圈正常速度
            } else {
                animationSpeed = baseSpeed * 1.2; // 等待停止信號時稍慢
            }
            
            setTimeout(tick, animationSpeed);
        }
        
        // 立即開始跑燈
        tick();
    });
}

// 停止動畫（帶減速效果）
function runStopAnimation(startPos, targetPos, steps, allGridItems, resolve, controller) {
    const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3];
    let currentPos = startPos;
    let remainingSteps = steps;
    
    function stopTick() {
        // 檢查是否強制停止
        if (controller && controller.forceStop) {
            // 清除所有效果並立即結束
            allGridItems.forEach(item => {
                item.classList.remove('running', 'winner');
                item.style.transition = 'none';
            });
            resolve();
            return;
        }
        
        if (remainingSteps <= 0) {
            // 最終停止
            allGridItems.forEach(item => item.classList.remove('running'));
            const finalHtmlIndex = clockwiseOrder[targetPos];
            const finalElement = allGridItems[finalHtmlIndex];
            if (finalElement && !finalElement.classList.contains('center')) {
                finalElement.classList.add('winner');
            }
            
            // 立即解析Promise
            resolve();
            return;
        }
        
        // 清除當前高亮
        allGridItems.forEach(item => item.classList.remove('running'));
        
        // 移動到下一位置
        currentPos = (currentPos + 1) % 8;
        remainingSteps--;
        
        // 高亮當前位置
        const htmlIndex = clockwiseOrder[currentPos];
        const currentElement = allGridItems[htmlIndex];
        if (currentElement && !currentElement.classList.contains('center')) {
            currentElement.classList.add('running');
        }
        
        // 計算減速：越接近目標越慢
        const progress = (steps - remainingSteps) / steps;
        let speed;
        if (remainingSteps <= 2) {
            speed = 100; // 最後兩步加快
        } else if (remainingSteps <= 4) {
            speed = 80; // 倒數四步加快
        } else {
            speed = 50; // 保持高速旋轉
        }
        
        setTimeout(stopTick, speed);
    }
    
    stopTick();
}

// 預生成九宮格配置（不渲染DOM，只計算配置）
function preGenerateLotteryGrid(prizes) {
    if (!prizes || prizes.length === 0) {
        return;
    }
    
    // 順時鐘HTML位置映射
    const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3];
    
    // 分配獎項到8個位置
    const positionToPrize = {};
    const totalPositions = 8;
    
    if (prizes.length >= totalPositions) {
        // 獎項數量 >= 8個，取前8個
        for (let i = 0; i < totalPositions; i++) {
            positionToPrize[i] = prizes[i];
        }
    } else {
        // 獎項數量 < 8個，直接使用所有獎項
        for (let i = 0; i < prizes.length; i++) {
            positionToPrize[i] = prizes[i];
        }
    }
    
    // 保存預生成的配置到快取
    const gridConfig = {
        clockwiseOrder,
        prizes,
        positionToPrize,
        timestamp: Date.now()
    };
    
    cache.set('preGeneratedLotteryGrid', gridConfig, 600000); // 10分鐘快取
    
    }

// 從預生成配置快速渲染九宮格
function renderLotteryGridFromConfig(config, lotteryGrid) {
    const { clockwiseOrder, prizes, positionToPrize } = config;
    
    let gridHTML = '';
    
    // 生成9個格子
    for (let htmlIndex = 0; htmlIndex < 9; htmlIndex++) {
        if (htmlIndex === 4) {
            // 中心位置空白
            gridHTML += '<div class="grid-item center"></div>';
        } else {
            // 找到此HTML位置在順時鐘順序中的位置
            const clockwisePos = clockwiseOrder.indexOf(htmlIndex);
            
            if (clockwisePos === -1) {
                continue;
            }
            
            const prize = positionToPrize[clockwisePos];
            
            if (!prize) {
                continue;
            }
            
            gridHTML += `
                <div class="grid-item" data-prize-id="${prize.id}" data-clockwise-pos="${clockwisePos}">
                    ${prize.name}
                </div>
            `;
        }
    }
    
    lotteryGrid.innerHTML = gridHTML;
    
    // 保存配置到全域變數
    window.clockwiseOrder = clockwiseOrder;
    window.lotteryPrizes = prizes;
    window.positionToPrize = positionToPrize;
    
    console.log('⚡ 九宮格快速渲染完成');
}

// Firebase UI 更新函數
function updateActivitiesUI(activities) {
    const earnActivitiesList = document.getElementById('earnActivitiesList');
    if (!earnActivitiesList) return;
    
    if (!activities || activities.length === 0) {
        earnActivitiesList.innerHTML = '<div class="text-center py-3">目前沒有可用活動</div>';
        return;
    }
    
    const activitiesHTML = activities.map(activity => `
        <div class="activity-card mb-3">
            <div class="card-body">
                <h5 class="card-title">${activity.name}</h5>
                <p class="card-text">${activity.description}</p>
                <span class="badge badge-success">+${activity.reward || activity.points || 0} 點數</span>
                <button class="btn btn-primary btn-sm float-right" 
                        onclick="claimActivity('${activity.id}')"
                        ${!activity.isActive ? 'disabled' : ''}>
                    ${activity.isActive ? '參與活動' : '已結束'}
                </button>
            </div>
        </div>
    `).join('');
    
    earnActivitiesList.innerHTML = activitiesHTML;
}

function updateProductsUI(products) {
    const productsContainer = document.getElementById('productsList');
    if (!productsContainer) return;
    
    if (!products || products.length === 0) {
        productsContainer.innerHTML = '<div class="text-center py-3">目前沒有可兌換商品</div>';
        return;
    }
    
    const productsHTML = products.map(product => `
        <div class="product-card mb-3">
            <div class="card-body">
                <h5 class="card-title">${product.name}</h5>
                <p class="card-text">${product.description}</p>
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-primary font-weight-bold">${product.price} 點數</span>
                    <button class="btn btn-success btn-sm" 
                            onclick="exchangeProduct('${product.id}')"
                            ${!product.isAvailable || product.stock <= 0 ? 'disabled' : ''}>
                        ${product.stock > 0 ? '兌換' : '已售完'}
                    </button>
                </div>
                <small class="text-muted">庫存：${product.stock}</small>
            </div>
        </div>
    `).join('');
    
    productsContainer.innerHTML = productsHTML;
}

function updateLeaderboardUI(leaderboard, currentUserId) {
    const leaderboardContainer = document.getElementById('leaderboard');
    if (!leaderboardContainer) return;
    
    if (!leaderboard || leaderboard.length === 0) {
        leaderboardContainer.innerHTML = '<div class="text-center py-3">排行榜暫無資料</div>';
        return;
    }
    
    const leaderboardHTML = leaderboard.map((user, index) => `
        <div class="leaderboard-item ${user.userId === currentUserId ? 'current-user' : ''} mb-2">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <span class="rank">#${index + 1}</span>
                    <span class="name">${user.fbName}</span>
                    <small class="member-level">(${user.memberLevel})</small>
                </div>
                <span class="points">${user.currentPoints} 點數</span>
            </div>
        </div>
    `).join('');
    
    leaderboardContainer.innerHTML = leaderboardHTML;
}

function updatePointHistoryUI(pointHistory) {
    const historyContainer = document.getElementById('pointHistoryList');
    if (!historyContainer) return;
    
    if (!pointHistory || pointHistory.length === 0) {
        historyContainer.innerHTML = '<div class="text-center py-3">暫無點數異動記錄</div>';
        return;
    }
    
    const historyHTML = pointHistory.map(record => `
        <div class="history-item mb-2">
            <div class="d-flex justify-content-between">
                <div>
                    <strong>${record.description}</strong>
                    <br>
                    <small class="text-muted">${record.timestamp}</small>
                </div>
                <span class="points ${record.points > 0 ? 'text-success' : 'text-danger'}">
                    ${record.points > 0 ? '+' : ''}${record.points}
                </span>
            </div>
        </div>
    `).join('');
    
    historyContainer.innerHTML = historyHTML;
}

function updateLotteryHistoryUI(lotteryHistory) {
    const lotteryContainer = document.getElementById('lotteryHistoryList');
    if (!lotteryContainer) return;
    
    if (!lotteryHistory || lotteryHistory.length === 0) {
        lotteryContainer.innerHTML = '<div class="text-center py-3">暫無抽獎記錄</div>';
        return;
    }
    
    const historyHTML = lotteryHistory.map(record => `
        <div class="lottery-item mb-2">
            <div class="d-flex justify-content-between">
                <div>
                    <strong>${record.description}</strong>
                    <br>
                    <small class="text-muted">${record.timestamp}</small>
                </div>
                <span class="tickets ${record.tickets > 0 ? 'text-success' : 'text-danger'}">
                    ${record.tickets > 0 ? '+' : ''}${record.tickets} 抽獎券
                </span>
            </div>
        </div>
    `).join('');
    
    lotteryContainer.innerHTML = historyHTML;
}