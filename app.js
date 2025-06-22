// 設定
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzHzksJGFVs-23tNQDaP2HbqrODiqk3k0v3q120z78REcbxK8VgO4WXm_CFfCc33uyIgQ/exec'; // 需要替換為實際的Google Apps Script URL
let liffInitialized = false;
let currentUser = null;
let userActivityStatus = {};
let initialPageSetupComplete = false; // 增加標誌防止重複跳轉

// 頁面歷史記錄
let pageHistory = ['mainPage'];
let currentPageId = 'mainPage'; // 追蹤當前頁面

// 智能更新系統 - 重新設計
const smartUpdateSystem = {
    pendingUpdates: new Set(),
    lastUpdateTimes: new Map(),
    updateStrategies: {
        // 強制更新的頁面（每次都要重新載入）
        forceUpdate: ['main', 'header'],
        // 智能更新的頁面（根據時間和資料變化決定）
        smartUpdate: ['records', 'exchanged', 'leaderboard', 'lottery-history'],
        // 中等頻率更新的頁面
        mediumUpdate: ['earn', 'products', 'lottery'],
        // 低頻率更新的頁面
        lowUpdate: ['admin']
    },
    updateIntervals: {
        forceUpdate: 0,        // 每次都更新
        smartUpdate: 60000,    // 1分鐘
        mediumUpdate: 300000,  // 5分鐘
        lowUpdate: 600000      // 10分鐘
    },
    
    // 標記需要更新的頁面
    markForUpdate(pageIds) {
        if (Array.isArray(pageIds)) {
            pageIds.forEach(id => this.pendingUpdates.add(id));
        } else {
            this.pendingUpdates.add(pageIds);
        }
        console.log(`📝 標記頁面需要更新: ${Array.isArray(pageIds) ? pageIds.join(', ') : pageIds}`);
    },
    
    // 檢查並執行更新
    checkAndUpdate(targetPageId) {
        if (!targetPageId) return;
        
        console.log(`🔍 檢查頁面更新需求: ${targetPageId}`);
        
        const strategy = this.getUpdateStrategy(targetPageId);
        const lastUpdate = this.lastUpdateTimes.get(targetPageId) || 0;
        const now = Date.now();
        const timeSinceUpdate = now - lastUpdate;
        const requiredInterval = this.updateIntervals[strategy];
        
        console.log(`📊 頁面 ${targetPageId} 更新策略: ${strategy}, 上次更新: ${timeSinceUpdate}ms前, 需求間隔: ${requiredInterval}ms`);
        
        // 強制更新或達到更新間隔時間
        if (strategy === 'forceUpdate' || 
            timeSinceUpdate >= requiredInterval || 
            this.pendingUpdates.has(targetPageId)) {
            
            console.log(`✅ 執行頁面更新: ${targetPageId}`);
            this.executeUpdate(targetPageId);
            this.lastUpdateTimes.set(targetPageId, now);
            this.pendingUpdates.delete(targetPageId);
            return true;
        }
        
        console.log(`⏳ 頁面 ${targetPageId} 暫不需要更新`);
        return false;
    },
    
    // 背景更新多個頁面
    async backgroundUpdate(pageIds) {
        console.log(`🔄 開始背景更新頁面: ${pageIds.join(', ')}`);
        
        const updatePromises = pageIds.map(async (pageId) => {
            try {
                await this.executeBackgroundUpdate(pageId);
                this.lastUpdateTimes.set(pageId, Date.now());
                this.pendingUpdates.delete(pageId);
                console.log(`✅ 背景更新完成: ${pageId}`);
            } catch (error) {
                console.error(`❌ 背景更新失敗 ${pageId}:`, error);
            }
        });
        
        await Promise.allSettled(updatePromises);
        console.log(`🎉 所有背景更新完成`);
    },
    
    // 獲取頁面更新策略
    getUpdateStrategy(pageId) {
        for (const [strategy, pages] of Object.entries(this.updateStrategies)) {
            if (pages.includes(pageId)) {
                return strategy;
            }
        }
        return 'mediumUpdate'; // 預設策略
    },
    
    // 更新當前頁面
    updateCurrentPage() {
        const currentPageId = document.querySelector('.page.active')?.id;
        if (currentPageId) {
            this.checkAndUpdate(currentPageId);
        }
    },
    
    // 執行同步更新
    executeUpdate(pageId) {
        switch (pageId) {
            case 'main':
                // 主頁面強制重新載入關鍵資料
                loadUserProfileOptimized();
                break;
            case 'header':
                // 標頭資訊更新
                if (currentUser) {
                    loadUserProfileImmediate();
                }
                break;
            case 'earn':
                refreshEarnPage();
                break;
            case 'products':
                refreshProductsPage();
                break;
            case 'records':
                refreshRecordsPage();
                break;
            case 'exchanged':
                refreshExchangedPage();
                break;
            case 'leaderboard':
                refreshLeaderboardPage();
                break;
            case 'lottery':
                refreshLotteryPage();
                break;
            case 'lottery-history':
                loadLotteryHistory();
                break;
            default:
                console.log(`🤷 未知頁面ID: ${pageId}`);
        }
    },
    
    // 執行背景更新（非阻塞）
    async executeBackgroundUpdate(pageId) {
        if (!currentUser || !currentUser.userId) return;
        
        const accessToken = liff.getAccessToken();
        
        try {
            switch (pageId) {
                case 'records':
                    // 背景更新點數歷史
                    const historyResponse = await fetch(`${API_BASE_URL}?action=getPointHistory&userId=${currentUser.userId}&accessToken=${accessToken}`);
                    const historyResult = await historyResponse.json();
                    if (historyResult.success) {
                        cache.set('pointHistory', historyResult.data, 180000);
                    }
                    break;
                    
                case 'exchanged':
                    // 背景更新兌換商品
                    const exchangedResponse = await fetch(`${API_BASE_URL}?action=getExchangedProducts&userId=${currentUser.userId}&accessToken=${accessToken}`);
                    const exchangedResult = await exchangedResponse.json();
                    if (exchangedResult.success) {
                        cache.set('exchangedResult', exchangedResult, 300000);
                    }
                    break;
                    
                case 'leaderboard':
                    // 背景更新排行榜
                    const leaderboardResponse = await fetch(`${API_BASE_URL}?action=getLeaderboard&userId=${currentUser.userId}&accessToken=${accessToken}`);
                    const leaderboardResult = await leaderboardResponse.json();
                    if (leaderboardResult.success) {
                        cache.set('leaderboard', leaderboardResult.data, 600000);
                    }
                    break;
                    
                case 'lottery-history':
                    // 背景更新抽獎歷史
                    const lotteryHistoryResponse = await fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${accessToken}`);
                    const lotteryHistoryResult = await lotteryHistoryResponse.json();
                    if (lotteryHistoryResult.success) {
                        cache.set('lotteryHistory', lotteryHistoryResult.data, 180000);
                    }
                    break;
                    
                case 'lottery':
                    // 背景更新抽獎券和獎項
                    const [ticketsResponse, prizesResponse] = await Promise.all([
                        fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${accessToken}`),
                        fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${accessToken}`)
                    ]);
                    
                    const [ticketsResult, prizesResult] = await Promise.all([
                        ticketsResponse.json(),
                        prizesResponse.json()
                    ]);
                    
                    if (ticketsResult.success) {
                        cache.set('lotteryTickets', ticketsResult.data, 300000);
                    }
                    if (prizesResult.success) {
                        cache.set('lotteryPrizes', prizesResult.data, 300000);
                    }
                    break;
                    
                case 'earn':
                    // 背景更新活動和狀態
                    const [activitiesResponse, statusResponse] = await Promise.all([
                        fetch(`${API_BASE_URL}?action=getActivities&accessToken=${accessToken}`),
                        fetch(`${API_BASE_URL}?action=getUserActivityStatus&userId=${currentUser.userId}&accessToken=${accessToken}`)
                    ]);
                    
                    const [activitiesResult, statusResult] = await Promise.all([
                        activitiesResponse.json(),
                        statusResponse.json()
                    ]);
                    
                    if (activitiesResult.success) {
                        cache.set('activities', activitiesResult.data || [], 300000);
                    }
                    if (statusResult.success) {
                        cache.set('userActivityStatus', statusResult.data, 120000);
                    }
                    break;
                    
                case 'products':
                    // 背景更新商品列表
                    const productsResponse = await fetch(`${API_BASE_URL}?action=getProducts&accessToken=${accessToken}`);
                    const productsResult = await productsResponse.json();
                    if (productsResult.success) {
                        cache.set('products', productsResult.data, 300000);
                    }
                    break;
            }
        } catch (error) {
            console.error(`背景更新失敗 ${pageId}:`, error);
        }
    },
    
    // 清除所有待更新標記
    clearAll() {
        this.pendingUpdates.clear();
        console.log('🧹 清除所有待更新標記');
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
            return this.data[key];
        }
        this.clear(key);
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

// 初始化 LIFF - 優化版本
async function initializeLiff() {
    try {
        await liff.init({ liffId: '2007573269-X7EOlxw2' }); // 需要替換為實際的LIFF ID
        liffInitialized = true;
        
        if (liff.isLoggedIn()) {
            // 立即顯示基本用戶資料
            await loadUserProfileImmediate();
        } else {
            liff.login();
        }
    } catch (error) {
        console.error('LIFF初始化失敗:', error);
        showAlert('系統初始化失敗', 'danger');
    }
}

// 立即顯示用戶基本資料 - 最快速度
async function loadUserProfileImmediate() {
    const startTime = performance.now();
    try {
        console.log('⚡ 立即載入用戶基本資料...');
        
        // 1. 立即獲取並顯示LINE基本資料
        const profile = await liff.getProfile();
        currentUser = profile;
        
        console.log('✅ LINE資料獲取完成:', profile.displayName);
        
        // 2. 立即更新UI顯示
        document.getElementById('userName').textContent = profile.displayName;
        document.getElementById('userAvatar').textContent = profile.displayName.charAt(0);
        
        // 設定頭像
        if (profile.pictureUrl) {
            const avatar = document.getElementById('userAvatar');
            avatar.style.backgroundImage = `url(${profile.pictureUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.textContent = '';
        }
        
        // 3. 檢查是否有快取資料可以立即顯示
        const cachedBinding = cache.getStale('bindingResult');
        const cachedPoints = cache.getStale('pointsResult');
        const cachedExchanged = cache.getStale('exchangedResult');
        const cachedTickets = cache.getStale('lotteryTickets');
        
        if (cachedBinding && cachedBinding.success && cachedBinding.isBound) {
            // 立即顯示快取的電話和帳號狀態
            const phoneField = cachedBinding.userData?.phone || '';
            let displayPhone = '未設定電話';
            let accountStatus = '受限帳號(請至櫃檯洽詢)';
            let accountStatusClass = 'limited';
            
            if (phoneField) {
                let phoneStr = String(phoneField).trim();
                if (phoneStr.length === 9 && /^\d{9}$/.test(phoneStr)) {
                    displayPhone = '0' + phoneStr;
                    accountStatus = '完整帳號';
                    accountStatusClass = 'complete';
                } else if (phoneStr.length === 10 && phoneStr.startsWith('0') && /^\d{10}$/.test(phoneStr)) {
                    displayPhone = phoneStr;
                    accountStatus = '完整帳號';
                    accountStatusClass = 'complete';
                } else if (phoneStr) {
                    displayPhone = phoneStr;
                }
            }
            
            document.getElementById('userPhone').textContent = displayPhone;
            const accountStatusElement = document.getElementById('accountStatus');
            accountStatusElement.textContent = accountStatus;
            accountStatusElement.className = `account-status-large ${accountStatusClass}`;
        } else {
            // 沒有快取資料，顯示載入中
            document.getElementById('userPhone').textContent = '載入中...';
            document.getElementById('accountStatus').textContent = '載入中...';
        }
        
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
            document.getElementById('headerUnusedCount').textContent = unusedCount.toString();
        } else {
            document.getElementById('headerUnusedCount').textContent = '...';
        }
        
        const loadTime = performance.now() - startTime;
        console.log(`✅ 基本UI更新完成 (${loadTime.toFixed(2)}ms)，開始背景載入完整資料...`);
        
        // 4. 背景載入完整資料
        setTimeout(() => {
            loadUserProfileOptimized().catch(error => {
                console.error('背景載入完整資料失敗:', error);
            });
        }, 100); // 100ms後開始背景載入
        
    } catch (error) {
        console.error('❌ 立即載入用戶資料失敗:', error);
        // 如果立即載入失敗，回退到原有方式
        await loadUserProfileOptimized();
    }
}

// 優化的用戶資料載入 - 並行載入所有資料
async function loadUserProfileOptimized() {
    try {
        const startTime = performance.now();
        const profile = await liff.getProfile();
        currentUser = profile;
        
        console.log(`✅ 用戶資料載入完成: ${profile.displayName}`);
        
        // 並行載入所有用戶相關資料
        const [bindingResult, pointsResult, exchangedResult, ticketsResult] = await Promise.all([
            fetch(`${API_BASE_URL}?action=checkBinding&userId=${profile.userId}&accessToken=${liff.getAccessToken()}`).then(r => r.json()),
            fetch(`${API_BASE_URL}?action=getUserPoints&userId=${profile.userId}&accessToken=${liff.getAccessToken()}`).then(r => r.json()),
            fetch(`${API_BASE_URL}?action=getExchangedProducts&userId=${profile.userId}&accessToken=${liff.getAccessToken()}`).then(r => r.json()),
            fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${profile.userId}&accessToken=${liff.getAccessToken()}`).then(r => r.json())
        ]);
        
        console.log('🔄 所有用戶資料並行載入完成');
        
        // 處理用戶頭像和基本資訊（加入安全檢查）
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userNameLarge = document.getElementById('userNameLarge');
        
        if (userAvatar && profile.pictureUrl) userAvatar.src = profile.pictureUrl;
        if (userName) userName.textContent = profile.displayName;
        if (userNameLarge) userNameLarge.textContent = profile.displayName;
        
        // 處理電話號碼顯示
        let phoneDisplay = '未提供';
        if (bindingResult.success && bindingResult.userData && bindingResult.userData.phone) {
            phoneDisplay = bindingResult.userData.phone;
        }
        
        const userPhone = document.getElementById('userPhone');
        const userPhoneLarge = document.getElementById('userPhoneLarge');
        if (userPhone) userPhone.textContent = phoneDisplay;
        if (userPhoneLarge) userPhoneLarge.textContent = phoneDisplay;
        
        // 設定帳號狀態
        const accountStatus = bindingResult.isBound ? '已完成綁定' : '未完成綁定';
        const accountStatusClass = bindingResult.isBound ? 'complete' : 'limited';
        const accountStatusElement = document.getElementById('accountStatus');
        if (accountStatusElement) {
            accountStatusElement.textContent = accountStatus;
            accountStatusElement.className = `account-status ${accountStatusClass}`;
        }
        
        // 處理點數顯示
        if (pointsResult.success) {
            let points = 0;
            if (pointsResult.data && typeof pointsResult.data.currentPoints !== 'undefined') {
                points = pointsResult.data.currentPoints;
            } else if (typeof pointsResult.points !== 'undefined') {
                points = pointsResult.points;
            } else if (typeof pointsResult.data !== 'undefined') {
                points = pointsResult.data;
            }
            updatePointsDisplay(points);
        }
        
        // 處理抽獎券顯示
        if (ticketsResult.success) {
            updateLotteryTicketsDisplay(ticketsResult.data.currentTickets);
        }
        
        // 處理待使用商品數量
        if (exchangedResult.success) {
            const now = new Date();
            const unusedCount = exchangedResult.data.filter(product => {
                const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                return product.status === '未使用' && !isExpired;
            }).length;
            const headerUnusedCount = document.getElementById('headerUnusedCount');
            if (headerUnusedCount) {
                headerUnusedCount.textContent = unusedCount.toString();
            }
        }
        
        // 快取資料以供後續使用
        cache.set('userProfile', profile, 600000); // 10分鐘
        cache.set('bindingResult', bindingResult, 600000);
        cache.set('pointsResult', pointsResult, 60000); // 點數1分鐘快取
        cache.set('exchangedResult', exchangedResult, 300000); // 5分鐘
        cache.set('lotteryTickets', ticketsResult.success ? ticketsResult.data : null, 300000); // 5分鐘
        
        // 背景預載入其他頁面資料
        preloadAllPageData();
        
        // 標記智能更新系統需要更新主頁資料（如果存在）
        if (typeof smartUpdateSystem !== 'undefined') {
            smartUpdateSystem.markForUpdate(['main', 'header']);
        }
        
        const endTime = performance.now();
        console.log(`🎉 用戶資料載入優化完成，總耗時: ${(endTime - startTime).toFixed(2)}ms`);
        
    } catch (error) {
        console.error('載入用戶資料失敗:', error);
        showAlert('載入用戶資料失敗', 'warning');
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
        const accessToken = liff.getAccessToken();
        console.log('開始背景預載入資料...');
        
        // 延遲500ms後開始預載入，避免影響主要載入
        setTimeout(async () => {
            try {
                // 並行預載入所有需要的資料
                const preloadPromises = [];
                
                // 1. 預載入活動列表和用戶狀態（如果還沒快取）
                if (!cache.get('activities') || !cache.get('userActivityStatus')) {
                    preloadPromises.push(
                        Promise.all([
                            fetch(`${API_BASE_URL}?action=getActivities&accessToken=${accessToken}`),
                            fetch(`${API_BASE_URL}?action=getUserActivityStatus&userId=${currentUser.userId}&accessToken=${accessToken}`)
                        ]).then(async ([activitiesResponse, statusResponse]) => {
                            const [activitiesResult, statusResult] = await Promise.all([
                                activitiesResponse.json(),
                                statusResponse.json()
                            ]);
                            
                            if (activitiesResult.success) {
                                cache.set('activities', activitiesResult.data || [], 300000);
                            }
                            if (statusResult.success) {
                                cache.set('userActivityStatus', statusResult.data, 120000);
                            }
                            console.log('✅ 活動資料預載入完成');
                        }).catch(err => console.log('活動預載入失敗:', err))
                    );
                }
                
                // 2. 預載入商品列表（如果還沒快取）
                if (!cache.get('products')) {
                    preloadPromises.push(
                        fetch(`${API_BASE_URL}?action=getProducts&accessToken=${accessToken}`)
                            .then(response => response.json())
                            .then(result => {
                                if (result.success) {
                                    cache.set('products', result.data, 300000);
                                    console.log('✅ 商品資料預載入完成');
                                }
                            }).catch(err => console.log('商品預載入失敗:', err))
                    );
                }
                
                // 3. 預載入點數歷史（如果還沒快取）
                if (!cache.get('pointHistory')) {
                    preloadPromises.push(
                        fetch(`${API_BASE_URL}?action=getPointHistory&userId=${currentUser.userId}&accessToken=${accessToken}`)
                            .then(response => response.json())
                            .then(result => {
                                if (result.success) {
                                    cache.set('pointHistory', result.data, 180000);
                                    console.log('✅ 點數歷史預載入完成');
                                }
                            }).catch(err => console.log('點數歷史預載入失敗:', err))
                    );
                }
                
                // 4. 預載入排行榜（如果還沒快取）
                if (!cache.get('leaderboard')) {
                    preloadPromises.push(
                        fetch(`${API_BASE_URL}?action=getLeaderboard&userId=${currentUser.userId}&accessToken=${accessToken}`)
                            .then(response => response.json())
                            .then(result => {
                                if (result.success) {
                                    cache.set('leaderboard', result.data, 600000);
                                    console.log('✅ 排行榜預載入完成');
                                }
                            }).catch(err => console.log('排行榜預載入失敗:', err))
                    );
                }
                
                // 5. 預載入抽獎券和獎項資料（如果還沒快取）
                if (!cache.get('lotteryTickets') || !cache.get('lotteryPrizes')) {
                    preloadPromises.push(
                        Promise.all([
                            fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${accessToken}`),
                            fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${accessToken}`)
                        ]).then(async ([ticketsResponse, prizesResponse]) => {
                            const [ticketsResult, prizesResult] = await Promise.all([
                                ticketsResponse.json(),
                                prizesResponse.json()
                            ]);
                            
                            if (ticketsResult.success) {
                                cache.set('lotteryTickets', ticketsResult.data, 300000);
                            }
                            if (prizesResult.success) {
                                cache.set('lotteryPrizes', prizesResult.data, 600000);
                                // 預生成九宮格配置
                                preGenerateLotteryGrid(prizesResult.data);
                            }
                            console.log('✅ 抽獎資料預載入完成');
                        }).catch(err => console.log('抽獎資料預載入失敗:', err))
                    );
                }
                
                // 6. 預載入抽獎歷史（如果還沒快取）
                if (!cache.get('lotteryHistory')) {
                    preloadPromises.push(
                        fetch(`${API_BASE_URL}?action=getLotteryHistory&userId=${currentUser.userId}&accessToken=${accessToken}`)
                            .then(response => response.json())
                            .then(result => {
                                if (result.success) {
                                    cache.set('lotteryHistory', result.data, 180000);
                                    console.log('✅ 抽獎歷史預載入完成');
                                }
                            }).catch(err => console.log('抽獎歷史預載入失敗:', err))
                    );
                }
                
                // 等待所有預載入完成
                await Promise.allSettled(preloadPromises);
                console.log('🎉 所有資料預載入完成！');
                
            } catch (error) {
                console.log('預載入過程中發生錯誤:', error);
            }
        }, 500);
        
    } catch (error) {
        console.log('預載入初始化失敗:', error);
    }
}

// 載入用戶點數 - 優化版本
async function loadUserPoints() {
    if (!currentUser || !currentUser.userId) {
        console.log('用戶資訊尚未載入，跳過點數載入');
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
        updatePointsDisplay(points);
        return;
    }
    
    try {
        const accessToken = liff.getAccessToken();
        const response = await fetch(`${API_BASE_URL}?action=getUserPoints&userId=${currentUser.userId}&accessToken=${accessToken}`);
        const result = await response.json();
        
        if (result.success) {
            // 快取結果
            cache.set('pointsResult', result, 60000); // 1分鐘快取
            
            // 處理不同的 API 回應格式
            let points = 0;
            if (result.data && typeof result.data.currentPoints !== 'undefined') {
                points = result.data.currentPoints;
            } else if (typeof result.points !== 'undefined') {
                points = result.points;
            } else if (typeof result.data !== 'undefined') {
                points = result.data;
            }
            
            updatePointsDisplay(points);
        } else {
            console.error('載入點數失敗:', result.message || result.error || 'API 回應 success 為 false');
            updatePointsDisplay(0);
        }
    } catch (error) {
        console.error('載入點數時發生錯誤:', error);
        updatePointsDisplay(0);
    }
}

// 統一更新點數顯示
function updatePointsDisplay(points) {
    const headerPoints = document.getElementById('headerPoints');
    if (headerPoints) {
        headerPoints.textContent = points.toLocaleString();
    }
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
        document.getElementById('headerUnusedCount').textContent = unusedCount.toString();
        return;
    }
    
    try {
        const response = await fetch(API_BASE_URL, {
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
            
            // 計算待使用商品數量（未使用且未過期）
            const now = new Date();
            const unusedCount = result.data.filter(product => {
                const isExpired = product.expirationDate && new Date(product.expirationDate) < now;
                return product.status === '未使用' && !isExpired;
            }).length;
            
            document.getElementById('headerUnusedCount').textContent = unusedCount.toString();
        } else {
            document.getElementById('headerUnusedCount').textContent = '0';
        }
    } catch (error) {
        console.error('載入待使用商品數量失敗:', error);
        document.getElementById('headerUnusedCount').textContent = '0';
    }
}

// 頁面切換 - 整合智能更新系統
function showPage(pageId) {
    document.getElementById('mainPage').style.display = 'none';
    const pages = document.querySelectorAll('.page-content');
    pages.forEach(page => page.classList.remove('active'));
    
    // 更新當前頁面ID
    currentPageId = pageId;
    
    if (pageId === 'mainPage') {
        document.getElementById('mainPage').style.display = 'block';
        // 清空歷史記錄，只保留主頁
        pageHistory = ['mainPage'];
        currentPageId = 'mainPage';
    } else {
        document.getElementById(pageId).classList.add('active');
        // 添加新頁面到歷史記錄
        if (pageHistory[pageHistory.length - 1] !== pageId) {
            pageHistory.push(pageId);
        }
        
        // 檢查是否有背景更新完成的資料
        smartUpdateSystem.checkAndUpdate(pageId);
        
        // 正常載入（優先使用快取，如果有背景更新的話快取已經是最新的）
        switch (pageId) {
            case 'recordsPage':
                // 預設載入點數記錄
                loadPointHistory();
                break;
            case 'earnPage':
                loadEarnActivities();
                break;
            case 'productsPage':
                loadProducts();
                break;
            case 'exchangedPage':
                loadExchangedProducts();
                break;
            case 'leaderboardPage':
                loadLeaderboard();
                break;
            case 'lotteryPage':
                loadLotteryPage();
                break;
        }
    }
    
    // 標記初始化完成
    initialPageSetupComplete = true;
}

// 載入商品列表 - 優化版本
async function loadProducts() {
    const productsList = document.getElementById('productsList');
    
    // 先檢查快取
    const cachedProducts = cache.get('products');
    if (cachedProducts) {
        console.log('✅ 使用商品快取資料，立即顯示');
        displayProducts(cachedProducts);
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
        const accessToken = liff.getAccessToken();
        const response = await fetch(`${API_BASE_URL}?action=getProducts&accessToken=${accessToken}`);
        const result = await response.json();
        
        if (result.success) {
            // 快取商品資料
            cache.set('products', result.data, 300000); // 5分鐘快取
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

// 載入點數異動紀錄 - 優化版本
async function loadPointHistory() {
    const historyList = document.getElementById('historyList');
    
    // 先檢查快取
    const cachedHistory = cache.get('pointHistory');
    if (cachedHistory) {
        console.log('✅ 使用點數歷史快取資料，立即顯示');
        displayPointHistory(cachedHistory);
        return;
    }
    
    // 沒有快取時才顯示載入畫面
    historyList.innerHTML = `
        <div class="loading">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">載入中...</span>
            </div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}?action=getPointHistory&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            // 快取結果
            cache.set('pointHistory', result.data, 180000); // 3分鐘快取
            displayPointHistory(result.data);
        } else {
            historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有異動紀錄</div>';
        }
    } catch (error) {
        console.error('載入異動紀錄失敗:', error);
        historyList.innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>載入失敗</h5>
                <p>無法載入點數紀錄，請稍後再試</p>
                <button class="btn btn-primary" onclick="loadPointHistory()">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
    }
}

// 顯示點數歷史紀錄的輔助函數
function displayPointHistory(historyData) {
    const historyList = document.getElementById('historyList');
    
    if (historyData && historyData.length > 0) {
        // 只顯示最近15筆紀錄
        const recentHistory = historyData.slice(0, 15);
        
        // 顯示紀錄總數
        historyList.innerHTML = `
            <div class="text-center mb-3">
                <small class="text-muted-point text-white">
                    顯示最近 ${recentHistory.length} 筆紀錄
                    ${historyData.length > 15 ? `（共 ${historyData.length} 筆）` : ''}
                </small>
            </div>
        `;
        
        historyList.innerHTML += recentHistory.map(item => {
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
                            <div class="history-points fw-bold ${item.points >= 0 ? 'text-success' : 'text-danger'}">
                                ${item.points >= 0 ? '+' : ''}${item.points}
                            </div>
                            <div class="small text-muted">餘額: ${item.balance}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
                                `<button class="btn-claim" onclick="claimPoints('${activity.id}')">
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
        
        console.log('活動列表回應:', activitiesResult);
        console.log('用戶狀態回應:', statusResult);
        console.log('用戶狀態除錯資訊:', statusResult.debug);
        
        if (statusResult.success) {
            userActivityStatus = statusResult.data;
            // 快取用戶狀態
            cache.set('userActivityStatus', statusResult.data, 120000); // 2分鐘快取
            console.log('設定 userActivityStatus:', userActivityStatus);
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
        console.log('可用活動數量:', activities.length);
        
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
        statusDiv.innerHTML = '<div class="scan-status success">掃描成功！正在處理...</div>';
        
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
    try {
        showAlert('處理中...', 'info');
        
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
            
            // 使用智能更新系統
            // 1. 立即更新點數顯示
            if (result.currentPoints !== undefined) {
                updatePointsDisplay(result.currentPoints);
                cache.clear('pointsResult'); // 清理點數快取以確保一致性
            } else {
                loadUserPoints();
            }
            
            // 2. 立即更新當前頁面
            smartUpdateSystem.updateCurrentPage();
            
            // 3. 背景更新其他受影響頁面
            smartUpdateSystem.backgroundUpdate(['historyPage', 'leaderboardPage']);
            
            console.log('🎯 QR掃描領取完成，已啟動背景更新');
        } else {
            showAlert(result.error || '領取失敗', 'danger');
        }
    } catch (error) {
        console.error('QR掃描領取失敗:', error);
        showAlert('領取失敗，請稍後再試', 'danger');
    }
}

// 按鈕領取點數 - 智能更新版本
async function claimPointsByButton(activityId) {
    try {
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
            
            // 使用智能更新系統
            // 1. 立即更新點數顯示
            if (result.currentPoints !== undefined) {
                updatePointsDisplay(result.currentPoints);
                cache.clear('pointsResult'); // 清理點數快取以確保一致性
            } else {
                loadUserPoints();
            }
            
            // 2. 立即更新當前頁面
            smartUpdateSystem.updateCurrentPage();
            
            // 3. 背景更新其他受影響頁面
            smartUpdateSystem.backgroundUpdate(['historyPage', 'leaderboardPage']);
            
            console.log('🎯 按鈕領取完成，已啟動背景更新');
        } else {
            showAlert(result.error || '領取失敗', 'danger');
        }
    } catch (error) {
        console.error('按鈕領取失敗:', error);
        showAlert('領取失敗，請稍後再試', 'danger');
    }
}

// 兌換商品 - 智能更新版本
async function exchangeProduct(productId) {
    if (!currentUser || !currentUser.userId) {
        showAlert('請先登入', 'warning');
        return;
    }

    try {
        showAlert('處理中...', 'info');
        
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=exchangeProduct&userId=${currentUser.userId}&productId=${productId}&accessToken=${liff.getAccessToken()}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message || '兌換成功！', 'success');
            
            // 使用智能更新系統
            // 1. 立即更新點數顯示和頭部待使用商品數量
            updatePointsDisplay(result.currentPoints);
            cache.clear('pointsResult'); // 清理點數快取
            cache.clear('exchangedResult'); // 清理已兌換商品快取
            loadUnusedProductsCount(); // 立即更新待使用商品數量
            
            // 2. 立即更新當前頁面
            smartUpdateSystem.updateCurrentPage();
            
            // 3. 背景更新其他受影響頁面
            smartUpdateSystem.backgroundUpdate(['historyPage', 'exchangedPage', 'leaderboardPage']);
            
            console.log('🛒 商品兌換完成，已啟動背景更新');
        } else {
            showAlert(result.error || '兌換失敗', 'danger');
        }
    } catch (error) {
        console.error('兌換商品失敗:', error);
        showAlert('兌換失敗，請稍後再試', 'danger');
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
        
        return date.toLocaleDateString('zh-TW') + ' ' + date.toLocaleTimeString('zh-TW', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
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
    initializeLiff();
}); 

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
    console.log('displayActivities 被呼叫');
    console.log('活動數量:', activities.length);
    console.log('用戶活動狀態:', userActivityStatus);
    
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
        console.log(`活動 ${activity.id} (${activity.name}):`);
        console.log('- 參與記錄:', userActivityStatus[activity.id]);
        
        const participations = userActivityStatus[activity.id] || [];
        const participationCount = participations.length;
        const maxParticipations = activity.maxParticipations || 999;
        
        console.log('- 參與次數:', participationCount);
        console.log('- 最大次數:', maxParticipations);

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
        participationInfo.innerHTML = `<i class="bi bi-trophy"></i> 已領取次數：${participationCount}/${maxParticipations === 999 ? '無限' : maxParticipations}`;
        
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
            console.error('無效的結束時間:', activity.endTime);
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
            timeInfo.innerHTML = `<i class="bi bi-check-circle"></i> 已達最大參與次數<br><i class="bi bi-calendar-x"></i> 活動結束：${formatDateTime(endTime)}`;
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
                    timeInfo.innerHTML = `<i class="bi bi-clock"></i> ${remainingHours}小時${remainingMinutes}分鐘後可再次領取<br><i class="bi bi-calendar-x"></i> 活動結束：${formatDateTime(endTime)}`;
                } else {
                    timeInfo.innerHTML = `<i class="bi bi-clock"></i> ${remainingMinutes}分鐘後可再次領取<br><i class="bi bi-calendar-x"></i> 活動結束：${formatDateTime(endTime)}`;
                }
            } else {
                card.classList.add('activity-available');
                status.className = 'activity-status status-available';
                status.textContent = '可領取';
                timeInfo.innerHTML = `<i class="bi bi-clock"></i> 每${activity.frequencyLimit}小時可領取一次<br><i class="bi bi-calendar-x"></i> 活動結束：${formatDateTime(endTime)}`;
            }
        } else {
            // 從未參與過
            card.classList.add('activity-available');
            status.className = 'activity-status status-available';
            status.textContent = '可領取';
            timeInfo.innerHTML = `<i class="bi bi-clock"></i> 每${activity.frequencyLimit}小時可領取一次<br><i class="bi bi-calendar-x"></i> 活動結束：${formatDateTime(endTime)}`;
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
        
        // 設置按鈕事件
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
    // 清理相關快取
    cache.clear('pointHistory');
    cache.clear('lotteryHistory');
    cache.clear('pointsResult');
    
    // 檢查當前顯示的是哪個標籤
    const activeTab = document.querySelector('#recordsPage .tab-content.active');
    if (activeTab && activeTab.id === 'pointsRecordsTab') {
        loadPointHistory();
    } else if (activeTab && activeTab.id === 'lotteryRecordsTab') {
        loadLotteryHistory();
    } else {
        // 預設載入點數記錄
        loadPointHistory();
    }
    
    loadUserPoints();
    showAlert('重新整理完成', 'success');
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

// 切換記錄標籤
function switchRecordsTab(tabId) {
    const pointsTab = document.getElementById('pointsRecordsTabBtn');
    const lotteryTab = document.getElementById('lotteryRecordsTabBtn');
    
    if (tabId === 'points') {
        // 設置點數記錄為選中狀態
        pointsTab.className = 'tab-btn tab-active';
        lotteryTab.className = 'tab-btn tab-inactive';
        
        // 顯示點數記錄內容，隱藏抽獎記錄內容
        document.getElementById('pointsRecordsTab').classList.add('active');
        document.getElementById('lotteryRecordsTab').classList.remove('active');
        
        // 載入點數記錄
        loadPointHistory();
    } else {
        // 設置抽獎記錄為選中狀態
        pointsTab.className = 'tab-btn tab-inactive';
        lotteryTab.className = 'tab-btn tab-active';
        
        // 顯示抽獎記錄內容，隱藏點數記錄內容
        document.getElementById('pointsRecordsTab').classList.remove('active');
        document.getElementById('lotteryRecordsTab').classList.add('active');
        
        // 載入抽獎記錄
        loadLotteryHistory();
    }
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
        const expiryDate = product.expirationDate ? new Date(product.expirationDate) : null;
        product.isExpired = expiryDate && expiryDate < now;
    });
    
    // 分類商品
    const unusedProducts = products.filter(p => p.status === '未使用' && !p.isExpired);
    const usedOrExpiredProducts = products.filter(p => p.status === '已使用' || p.isExpired)
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
    
    // 更新header中的待使用商品數量
    const headerUnusedCount = document.getElementById('headerUnusedCount');
    if (headerUnusedCount) {
        headerUnusedCount.textContent = unusedProducts.length.toString();
    }
    
    // 只顯示最近15筆已使用/已過期的商品
    const recentUsedProducts = usedOrExpiredProducts.slice(0, 15);
    
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
        // 顯示紀錄總數
        if (usedOrExpiredProducts.length > 15) {
            const countInfo = document.createElement('div');
            countInfo.className = 'text-center mb-3';
            countInfo.innerHTML = `
                <small class="text-muted">
                    顯示最近 15 筆紀錄（共 ${usedOrExpiredProducts.length} 筆）
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
    if (isUsed) {
        statusClass = 'status-redeemed';
        statusText = '已使用';
    } else if (product.isExpired) {
        statusClass = 'status-expired';
        statusText = '已過期';
    } else {
        statusClass = 'status-pending';
        statusText = '待使用';
    }
    
    // 商品期限資訊
    let timeInfoHTML = '';
    
    // 1. 兌換時間（一定會有）
    timeInfoHTML += `<div class="time-info-item">
        <i class="bi bi-bag-check"></i> 兌換時間：${formatDateTime(product.exchangeTime)}
    </div>`;
    
    // 2. 使用期限（如果有）
    if (product.expirationDate) {
        const expiryText = formatDateTime(product.expirationDate);
        if (product.isExpired && !product.useTime) {
            // 過期且未使用的情況下顯示警告
            timeInfoHTML += `<div class="time-info-item text-danger">
                <i class="bi bi-exclamation-triangle"></i> 使用期限：${expiryText} (已過期)
            </div>`;
        } else {
            timeInfoHTML += `<div class="time-info-item">
                <i class="bi bi-calendar-check"></i> 使用期限：${expiryText}
            </div>`;
        }
    }
    
    // 3. 使用時間（如果有）
    if (product.useTime) {
        timeInfoHTML += `<div class="time-info-item text-success">
            <i class="bi bi-check-circle"></i> 使用時間：${formatDateTime(product.useTime)}
        </div>`;
    }
    
    // 如果是抽獎獎品，增加來源說明
    let sourceInfo = '';
    if (product.productId && (product.productId.startsWith('PRIZE') || product.productId === 'THANKS')) {
        sourceInfo = `<div class="source-info">
            <i class="bi bi-gift"></i> 來源：抽獎獎品
        </div>`;
    }
    
    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="mb-0">${product.name}</h5>
                    <span class="redemption-status ${statusClass} ms-3">${statusText}</span>
                </div>
                <p class="mb-2 text-muted small">${product.description || ''}</p>
                ${sourceInfo}
                <div class="time-info text-muted small">
                    ${timeInfoHTML}
                </div>
            </div>
        </div>
        ${!isUsed && !product.isExpired ? `
            <div class="text-end mt-2">
                <button class="redeem-action-btn" onclick="useProduct('${product.exchangeId}', '${product.name}')">
                    <i class="bi bi-check-circle"></i> 標記已使用
                </button>
            </div>
        ` : ''}
    `;
    
    return card;
}

// 使用商品 - 智能更新版本
async function useProduct(exchangeId, productName) {
    try {
        if (!confirm(`確定要使用「${productName}」嗎？使用後將無法復原。`)) {
            return;
        }
        
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
            
            // 使用智能更新系統
            // 1. 立即更新頭部待使用商品數量
            cache.clear('exchangedResult'); // 清理已兌換商品快取
            loadUnusedProductsCount(); // 立即更新待使用商品數量
            
            // 2. 立即更新當前頁面
            smartUpdateSystem.updateCurrentPage();
            
            // 3. 背景更新其他受影響頁面
            smartUpdateSystem.backgroundUpdate(['recordsPage']);
            
            console.log('✅ 商品使用完成，已啟動背景更新');
        } else {
            showAlert(result.error || '使用失敗', 'danger');
        }
    } catch (error) {
        console.error('使用商品失敗:', error);
        showAlert('使用失敗，請稍後再試', 'danger');
    }
}

// 載入排行榜 - 優化版本
async function loadLeaderboard() {
    const myRankCard = document.getElementById('myRankCard');
    const leaderboardList = document.getElementById('leaderboardList');
    
    // 先檢查快取
    const cachedLeaderboard = cache.get('leaderboard');
    if (cachedLeaderboard) {
        console.log('✅ 使用排行榜快取資料，立即顯示');
        displayLeaderboard(cachedLeaderboard.leaderboard, cachedLeaderboard.myRank);
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
    if (myRankCard) myRankCard.innerHTML = loadingHtml;
    if (leaderboardList) leaderboardList.innerHTML = loadingHtml;
    
    try {
        const response = await fetch(`${API_BASE_URL}?action=getLeaderboard&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            // 快取排行榜資料
            cache.set('leaderboard', result.data, 600000); // 10分鐘快取
            displayLeaderboard(result.data.leaderboard, result.data.myRank);
        } else {
            const errorHtml = `
                <div class="error-message">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>載入失敗</h5>
                    <p>${result.error || '載入排行榜失敗'}</p>
                    <button class="btn btn-primary" onclick="loadLeaderboard()">
                        <i class="bi bi-arrow-clockwise"></i> 重新載入
                    </button>
                </div>
            `;
            if (myRankCard) myRankCard.innerHTML = errorHtml;
            if (leaderboardList) leaderboardList.innerHTML = '';
        }
    } catch (error) {
        console.error('載入排行榜失敗:', error);
        const errorHtml = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <h5>網路錯誤</h5>
                <p>無法連接到伺服器，請檢查網路連線</p>
                <button class="btn btn-primary" onclick="loadLeaderboard()">
                    <i class="bi bi-arrow-clockwise"></i> 重新載入
                </button>
            </div>
        `;
        if (myRankCard) myRankCard.innerHTML = errorHtml;
        if (leaderboardList) leaderboardList.innerHTML = '';
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
        leaderboardList.innerHTML = '<div class="no-leaderboard"><i class="bi bi-trophy"></i>目前沒有排行榜資料</div>';
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
                領先您 ${(prevUser.currentPoints - myRank.currentPoints).toLocaleString()} 點
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
                您領先 ${(myRank.currentPoints - nextUser.currentPoints).toLocaleString()} 點
            </div>
        </div>`;
    }
    
    return html;
}

// 建立排名卡片
function createRankCard(user, isMyRank = false, isNeighbor = false) {
    const rank = user.rank;
    const displayName = user.lineName ? `${user.lineName.charAt(0)}xx` : `${user.fbName.charAt(0)}xx`;
    
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
                    ${user.currentPoints.toLocaleString()}
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

// 重新整理當前頁面 - 智能更新版本
function refreshCurrentPage() {
    const activePage = document.querySelector('.page-content.active');
    showAlert('正在重新整理...', 'info');
    
    if (!activePage) {
        // 如果在主頁面，重新載入點數和頭部資訊
        loadUserPoints();
        loadUnusedProductsCount();
        showAlert('重新整理完成', 'success');
        return;
    }

    const pageId = activePage.id;
    console.log(`🔄 手動重新整理頁面: ${pageId}`);

    // 清理對應頁面的快取並強制重新載入
    switch (pageId) {
        case 'recordsPage':
            cache.clear('pointHistory');
            cache.clear('lotteryHistory');
            // 檢查當前顯示的是哪個標籤
            const activeTab = document.querySelector('#recordsPage .tab-content.active');
            if (activeTab && activeTab.id === 'pointsRecordsTab') {
                loadPointHistory();
            } else if (activeTab && activeTab.id === 'lotteryRecordsTab') {
                loadLotteryHistory();
            } else {
                // 預設載入點數記錄
                loadPointHistory();
            }
            break;
        case 'earnPage':
            cache.clear('activities');
            cache.clear('userActivityStatus');
            loadEarnActivities();
            break;
        case 'productsPage':
            cache.clear('products');
            loadProducts();
            break;
        case 'exchangedPage':
            cache.clear('exchangedResult');
            loadExchangedProducts();
            loadUnusedProductsCount(); // 同時更新頭部資訊
            break;
        case 'leaderboardPage':
            cache.clear('leaderboard');
            loadLeaderboard();
            break;
        default:
            console.log('未知頁面:', pageId);
            break;
    }
    
    // 同時更新基本資訊
    loadUserPoints();
    
    // 清理對應頁面的待更新標記（因為我們已經手動重新整理了）
    smartUpdateSystem.pendingUpdates.delete(pageId);
    
    setTimeout(() => {
        showAlert('重新整理完成', 'success');
    }, 500);
}

// 返回上一頁
function goBack() {
    if (pageHistory.length <= 1) {
        // 如果只剩主頁或歷史記錄為空，直接回主頁
        showPage('mainPage');
        return;
    }
    
    // 移除當前頁面
    pageHistory.pop();
    // 顯示上一頁
    const previousPage = pageHistory[pageHistory.length - 1];
    
    if (previousPage === 'mainPage') {
        document.getElementById('mainPage').style.display = 'block';
        const pages = document.querySelectorAll('.page-content');
        pages.forEach(page => page.classList.remove('active'));
        loadUserPoints();
    } else {
        document.getElementById('mainPage').style.display = 'none';
        const pages = document.querySelectorAll('.page-content');
        pages.forEach(page => page.classList.remove('active'));
        document.getElementById(previousPage).classList.add('active');
    }
}

// ========== 抽獎系統相關函數 ==========

// 載入用戶抽獎券數量
async function loadLotteryTickets() {
    if (!currentUser || !currentUser.userId) {
        return;
    }
    
    try {
        const cachedTickets = cache.get('lotteryTickets');
        if (cachedTickets) {
            updateLotteryTicketsDisplay(cachedTickets.currentTickets);
            return;
        }
        
        const response = await fetch(`${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${liff.getAccessToken()}`);
        const result = await response.json();
        
        if (result.success) {
            cache.set('lotteryTickets', result.data, 300000); // 5分鐘快取
            updateLotteryTicketsDisplay(result.data.currentTickets);
        } else {
            updateLotteryTicketsDisplay(0);
        }
    } catch (error) {
        console.error('載入抽獎券失敗:', error);
        updateLotteryTicketsDisplay(0);
    }
}

// 更新抽獎券顯示
function updateLotteryTicketsDisplay(tickets) {
    const headerTickets = document.getElementById('headerLotteryTickets');
    if (headerTickets) {
        headerTickets.textContent = tickets.toString();
    }
}

// 載入抽獎頁面
async function loadLotteryPage() {
    console.log('=== 開始載入抽獎頁面 ===');
    
    const lotteryContainer = document.getElementById('lotteryContainer');
    const prizesContainer = document.getElementById('lotteryPrizesContainer');
    const ticketsDisplay = document.getElementById('lotteryTicketsDisplay');
    
    console.log('DOM 元素檢查:', {
        lotteryContainer: !!lotteryContainer,
        prizesContainer: !!prizesContainer,
        ticketsDisplay: !!ticketsDisplay
    });
    
    // 先檢查快取
    const cachedTickets = cache.get('lotteryTickets');
    const cachedPrizes = cache.get('lotteryPrizes');
    
    console.log('快取檢查:', {
        hasTicketsCache: !!cachedTickets,
        hasPrizesCache: !!cachedPrizes
    });
    
    if (cachedTickets && cachedPrizes) {
        console.log('✅ 使用抽獎快取資料，立即顯示');
        displayLotteryTickets(cachedTickets.currentTickets);
        displayLotteryPrizes(cachedPrizes);
        generateSimpleLotteryGrid(cachedPrizes);
        
        // 背景更新資料但不阻塞UI
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
                
                // 更新快取
                if (ticketsResult.success) {
                    cache.set('lotteryTickets', ticketsResult.data, 300000);
                    // 如果抽獎券數量有變化，更新顯示
                    if (ticketsResult.data.currentTickets !== cachedTickets.currentTickets) {
                        displayLotteryTickets(ticketsResult.data.currentTickets);
                    }
                }
                
                if (prizesResult.success) {
                    cache.set('lotteryPrizes', prizesResult.data, 600000);
                    // 如果獎項有變化，重新生成九宮格
                    if (JSON.stringify(prizesResult.data) !== JSON.stringify(cachedPrizes)) {
                        generateSimpleLotteryGrid(prizesResult.data);
                        displayLotteryPrizes(prizesResult.data);
                    }
                }
                
                console.log('🔄 背景更新抽獎資料完成');
            } catch (error) {
                console.log('🔄 背景更新失敗:', error);
            }
        }, 100); // 極短延遲，讓UI先顯示
        
        return;
    }
    
    // 顯示載入畫面
    if (ticketsDisplay) {
        ticketsDisplay.innerHTML = `
            <div class="loading">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
            </div>
        `;
    }
    
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
        console.log('準備發送 API 請求:', {
            userId: currentUser?.userId,
            hasAccessToken: !!accessToken,
            apiUrl: API_BASE_URL
        });
        
        const ticketsUrl = `${API_BASE_URL}?action=getLotteryTickets&userId=${currentUser.userId}&accessToken=${accessToken}`;
        const prizesUrl = `${API_BASE_URL}?action=getLotteryPrizes&accessToken=${accessToken}`;
        
        console.log('API URLs:', {
            ticketsUrl: ticketsUrl,
            prizesUrl: prizesUrl
        });
        
        const [ticketsResponse, prizesResponse] = await Promise.all([
            fetch(ticketsUrl),
            fetch(prizesUrl)
        ]);
        
        console.log('API 回應狀態:', {
            ticketsStatus: ticketsResponse.status,
            prizesStatus: prizesResponse.status
        });
        
        const [ticketsResult, prizesResult] = await Promise.all([
            ticketsResponse.json(),
            prizesResponse.json()
        ]);
        
        console.log('API 回應結果:', {
            ticketsResult: ticketsResult,
            prizesResult: prizesResult
        });
        
        // 處理抽獎券結果
        if (ticketsResult.success) {
            cache.set('lotteryTickets', ticketsResult.data, 300000);
            displayLotteryTickets(ticketsResult.data.currentTickets);
            console.log('✅ 抽獎券載入成功');
        } else {
            console.error('❌ 抽獎券載入失敗:', ticketsResult.error);
            if (ticketsDisplay) {
                ticketsDisplay.innerHTML = `
                    <div class="error-message">
                        <i class="bi bi-exclamation-triangle"></i>
                        <p>無法載入抽獎券資訊: ${ticketsResult.error}</p>
                    </div>
                `;
            }
        }
        
        // 處理獎項結果
        if (prizesResult.success) {
            cache.set('lotteryPrizes', prizesResult.data, 600000);
            console.log('✅ 獎項載入成功');
            console.log('📊 API返回的獎項數據:', prizesResult.data);
            console.log(`📈 獎項總數: ${prizesResult.data.length}`);
            
            // 檢查每個獎項的狀態
            prizesResult.data.forEach((prize, index) => {
                console.log(`  API獎項 ${index + 1}: ${prize.name} (${prize.id}) - 剩餘: ${prize.remainingQuantity}/${prize.totalQuantity}`);
            });
            
            displayLotteryPrizes(prizesResult.data);
            generateSimpleLotteryGrid(prizesResult.data);
        } else {
            console.error('❌ 獎項載入失敗:', prizesResult.error);
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
}

// 顯示抽獎券數量
function displayLotteryTickets(tickets) {
    const ticketsDisplay = document.getElementById('lotteryTicketsDisplay');
    if (ticketsDisplay) {
        ticketsDisplay.innerHTML = `
            <div class="lottery-tickets-card">
                <div class="tickets-icon">
                    <i class="bi bi-ticket-perforated"></i>
                </div>
                <div class="tickets-info">
                    <div class="tickets-count">${tickets}</div>
                    <div class="tickets-label">張抽獎券</div>
                </div>
            </div>
        `;
    }
    
    // 同時更新header顯示
    updateLotteryTicketsDisplay(tickets);
}

// 顯示獎項列表
function displayLotteryPrizes(prizes) {
    console.log('=== 開始顯示獎項列表 ===');
    console.log('傳入的獎項資料:', prizes);
    
    const prizesContainer = document.getElementById('lotteryPrizesContainer');
    console.log('獎項容器元素:', !!prizesContainer);
    
    if (!prizesContainer) {
        console.error('❌ 找不到獎項容器元素 #lotteryPrizesContainer');
        return;
    }
    
    if (!prizes || prizes.length === 0) {
        console.log('⚠️ 沒有獎項資料，顯示空狀態');
        prizesContainer.innerHTML = '<div class="no-prizes">目前沒有可抽取的獎項</div>';
        return;
    }
    
    console.log('獎項總數:', prizes.length);
    
    // 按機率排序，機率低的在前面（大獎在前面）
    const sortedPrizes = prizes.filter(p => p.id !== 'THANKS').sort((a, b) => a.probability - b.probability);
    const thanksItem = prizes.find(p => p.id === 'THANKS');
    
    console.log('篩選後的獎項:', {
        normalPrizes: sortedPrizes.length,
        hasThanksItem: !!thanksItem
    });
    
    let prizesHTML = '';
    
    // 顯示真正的獎項
    sortedPrizes.forEach((prize, index) => {
        console.log(`處理獎項 ${index + 1}:`, prize);
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
        console.log('添加謝謝參加項目:', thanksItem);
        prizesHTML += `
            <div class="prize-card thanks-card">
                <div class="prize-header">
                    <h5 class="prize-name">${thanksItem.name}</h5>
                </div>
                <p class="prize-description">${thanksItem.description}</p>
            </div>
        `;
    }
    
    console.log('生成的 HTML 長度:', prizesHTML.length);
    console.log('HTML 預覽:', prizesHTML.substring(0, 200) + '...');
    
    prizesContainer.innerHTML = prizesHTML;
    console.log('✅ 獎項列表已更新到 DOM');
    console.log('=== 獎項列表顯示完成 ===');
}

// 執行抽獎
async function drawLottery() {
    if (!currentUser || !currentUser.userId) {
        showAlert('請先登入', 'warning');
        return;
    }
    
    try {
        const drawButton = document.getElementById('drawLotteryBtn');
        
        if (drawButton) {
            drawButton.disabled = true;
            drawButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>抽獎中...';
        }
        
        // 清除上一次的效果
        const allGridItems = document.querySelectorAll('.grid-item:not(.center)');
        allGridItems.forEach(item => {
            item.classList.remove('running', 'winner');
        });
        
        // 檢查九宮格是否已生成，沒有才重新生成
        const existingGrid = document.querySelectorAll('.grid-item:not(.center)');
        if (existingGrid.length === 0) {
            console.log('🔄 九宮格未生成，重新載入獎項...');
            const prizesResponse = await fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${liff.getAccessToken()}`);
            const prizesResult = await prizesResponse.json();
            
            if (prizesResult.success) {
                generateSimpleLotteryGrid(prizesResult.data);
            }
        } else {
            console.log('✅ 九宮格已存在，直接開始抽獎');
        }
        
        console.log('🎰 立即開始跑燈動畫...');
        
        // 創建動畫控制器
        const animationController = {
            shouldStop: false,
            targetPosition: null,
            finalResult: null
        };
        
        // 立即開始跑燈動畫（無限循環直到收到停止信號）
        const animationPromise = runLotteryAnimationWithControl(animationController);
        
        // 同時發送API請求
        console.log('📡 同時發送抽獎請求...');
        const apiPromise = fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'drawLottery',
                userId: currentUser.userId,
                accessToken: liff.getAccessToken()
            })
        }).then(response => response.json());
        
        // 等待API回應
        const result = await apiPromise;
        
        console.log('📡 抽獎API回應:', result);
        
        if (result.success) {
            // 設定動畫停止信號
            animationController.shouldStop = true;
            animationController.finalResult = result.data;
            
            // 計算目標位置
            const targetPosition = getFinalPrizeId(result.data.prizeId);
            animationController.targetPosition = targetPosition;
            
            console.log('🎯 計算出的目標位置:', targetPosition, '獎項ID:', result.data.prizeId);
            
            // 等待動畫完成
            await animationPromise;
            
            // 動畫完成後，立即更新獎項列表和九宮格
            console.log('🔄 抽獎完成，立即更新獎項數據...');
            
            try {
                // 重新載入最新的獎項數據
                const updatedPrizesResponse = await fetch(`${API_BASE_URL}?action=getLotteryPrizes&accessToken=${liff.getAccessToken()}`);
                const updatedPrizesResult = await updatedPrizesResponse.json();
                
                if (updatedPrizesResult.success) {
                    console.log('✅ 獲取更新後的獎項數據成功');
                    
                    // 更新獎項快取
                    cache.set('lotteryPrizes', updatedPrizesResult.data, 600000);
                    
                    // 立即更新獎項顯示
                    displayLotteryPrizes(updatedPrizesResult.data);
                    
                    // 立即重新生成九宮格（保持中獎顯示）
                    generateSimpleLotteryGrid(updatedPrizesResult.data);
                    setCorrectWinnerDisplay(result.data.prizeId);
                    
                    console.log('🎉 獎項數量已即時更新');
                }
            } catch (updateError) {
                console.log('⚠️ 更新獎項數據失敗:', updateError);
            }
            
            // 更新抽獎券顯示
            updateLotteryTicketsDisplay(result.data.remainingTickets);
            displayLotteryTickets(result.data.remainingTickets);
            
            // 處理自動兌換（背景處理，不阻塞UI）
            if (!result.data.isThanks) {
                handlePrizeExchange(result.data);
            }
            
            // 延遲顯示結果彈窗（讓用戶看清楚中獎位置）
            setTimeout(() => {
                showLotteryResult(result.data);
            }, 1500);
            
            // 標記相關頁面需要更新
            smartUpdateSystem.markForUpdate(['lottery-history', 'records', 'header']);
            
            // 背景更新相關頁面
            smartUpdateSystem.backgroundUpdate(['lottery-history', 'records']);
            
            console.log('🎉 抽獎完成，已標記相關頁面更新');
            
        } else {
            // API錯誤，停止動畫
            animationController.shouldStop = true;
            
            await animationPromise;
            
            showAlert(result.error || '抽獎失敗', 'danger');
        }
        
    } catch (error) {
        console.error('抽獎失敗:', error);
        showAlert('網路錯誤，請稍後再試', 'danger');
    } finally {
        // 重新啟用按鈕
        setTimeout(() => {
            const drawButton = document.getElementById('drawLotteryBtn');
            if (drawButton) {
                drawButton.disabled = false;
                drawButton.innerHTML = '<i class="bi bi-gift"></i> 開始抽獎';
            }
        }, 3000);
    }
}

// 順時鐘九宮格生成
function generateSimpleLotteryGrid(prizes) {
    console.log('🎰 生成順時鐘九宮格...');
    console.log('📥 接收到的原始獎項資料:', prizes);
    
    const lotteryGrid = document.getElementById('lotteryGrid');
    if (!lotteryGrid) return;
    
    // 先嘗試使用預生成的配置
    const preGeneratedConfig = cache.get('preGeneratedLotteryGrid');
    if (preGeneratedConfig && JSON.stringify(preGeneratedConfig.validPrizes) === JSON.stringify(prizes.filter(p => p.remainingQuantity > 0))) {
        console.log('✅ 使用預生成的九宮格配置，快速渲染');
        renderLotteryGridFromConfig(preGeneratedConfig, lotteryGrid);
        return;
    }
    
    console.log('🔄 預生成配置不可用，重新計算...');
    
    // 詳細檢查每個獎項
    console.log('🔍 逐項檢查獎項資料:');
    prizes.forEach((prize, index) => {
        console.log(`  獎項 ${index + 1}: ${prize.name} (${prize.id})`);
        console.log(`    剩餘數量: ${prize.remainingQuantity}`);
        console.log(`    總數量: ${prize.totalQuantity}`);
        console.log(`    機率: ${prize.probability}%`);
        console.log(`    是否有效: ${prize.remainingQuantity > 0 ? '✅' : '❌'}`);
    });
    
    // 過濾有效獎項
    const validPrizes = prizes.filter(p => p.remainingQuantity > 0);
    
    console.log(`📊 過濾結果: 原始 ${prizes.length} 個獎項 → 有效 ${validPrizes.length} 個獎項`);
    console.log('✅ 有效獎項列表:');
    validPrizes.forEach((prize, index) => {
        console.log(`  ${index + 1}. ${prize.name} (${prize.id}) - 剩餘: ${prize.remainingQuantity}`);
    });
    
    if (prizes.length !== validPrizes.length) {
        console.log('❌ 被過濾掉的獎項:');
        const filteredOut = prizes.filter(p => p.remainingQuantity <= 0);
        filteredOut.forEach((prize, index) => {
            console.log(`  ${index + 1}. ${prize.name} (${prize.id}) - 剩餘: ${prize.remainingQuantity}`);
        });
    }
    
    // 順時鐘HTML位置映射
    // 九宮格布局:    順時鐘順序:
    // 0 1 2         0 → 1 → 2
    // 3 4 5    =>   ↑   X   ↓  (4是中心，X表示跳過)
    // 6 7 8         7 ← 6 ← 5
    //               
    // 順時鐘HTML位置: [0, 1, 2, 5, 8, 7, 6, 3]
    const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3]; // HTML索引的順時鐘順序（跳過中心位置4）
    
    // 智能分配獎項到8個位置
    const positionToPrize = {};
    const totalPositions = 8;
    
    if (validPrizes.length === 0) {
        console.log('❌ 沒有有效獎項');
        lotteryGrid.innerHTML = '<div class="grid-item center">暫無獎項</div>';
        return;
    }
    
    if (validPrizes.length >= totalPositions) {
        // 獎項數量 >= 8個，取前8個
        for (let i = 0; i < totalPositions; i++) {
            positionToPrize[i] = validPrizes[i];
        }
        console.log(`📦 獎項充足(${validPrizes.length}個)，使用前8個獎項`);
    } else {
        // 獎項數量 < 8個，智能填充
        console.log(`📦 獎項不足8個(${validPrizes.length}個)，進行智能填充`);
        
        // 首先分配所有不同的獎項
        for (let i = 0; i < validPrizes.length; i++) {
            positionToPrize[i] = validPrizes[i];
            console.log(`  位置 ${i} ← ${validPrizes[i].name} (${validPrizes[i].id})`);
        }
        
        // 對剩餘位置進行填充
        const remainingPositions = totalPositions - validPrizes.length;
        
        if (remainingPositions > 0) {
            console.log(`  需要填充 ${remainingPositions} 個額外位置`);
            
            // 優先填充"謝謝參加"
            const thanksItem = validPrizes.find(p => p.id === 'THANKS');
            const nonThanksItems = validPrizes.filter(p => p.id !== 'THANKS');
            
            for (let i = 0; i < remainingPositions; i++) {
                const positionIndex = validPrizes.length + i;
                
                if (thanksItem && i < Math.ceil(remainingPositions / 2)) {
                    // 前半部分用謝謝參加填充
                    positionToPrize[positionIndex] = thanksItem;
                    console.log(`  位置 ${positionIndex} ← ${thanksItem.name} (${thanksItem.id}) [填充:謝謝參加]`);
                } else if (nonThanksItems.length > 0) {
                    // 後半部分用其他獎項填充
                    const fillIndex = i % nonThanksItems.length;
                    positionToPrize[positionIndex] = nonThanksItems[fillIndex];
                    console.log(`  位置 ${positionIndex} ← ${nonThanksItems[fillIndex].name} (${nonThanksItems[fillIndex].id}) [填充:其他獎項]`);
                } else {
                    // 沒有其他選項時，用第一個獎項填充
                    positionToPrize[positionIndex] = validPrizes[0];
                    console.log(`  位置 ${positionIndex} ← ${validPrizes[0].name} (${validPrizes[0].id}) [填充:預設]`);
                }
            }
        }
    }
    
    // 顯示最終的位置對應表
    console.log('🗺️ 最終位置對應表:');
    for (let pos = 0; pos < totalPositions; pos++) {
        const prize = positionToPrize[pos];
        console.log(`  順時鐘位置 ${pos}: ${prize?.name || '未定義'} (${prize?.id || 'N/A'})`);
    }
    
    let gridHTML = '';
    
    console.log('📋 原始獎項列表:', validPrizes.map(p => `${p.id}: ${p.name}`));
    console.log('🔄 順時鐘位置對獎項映射:');
    
    // 生成9個格子
    for (let htmlIndex = 0; htmlIndex < 9; htmlIndex++) {
        if (htmlIndex === 4) {
            // 中心位置空白
            gridHTML += '<div class="grid-item center"></div>';
            console.log(`  HTML位置 ${htmlIndex}: 中心位置（空白）`);
        } else {
            // 找到此HTML位置在順時鐘順序中的位置
            const clockwisePos = clockwiseOrder.indexOf(htmlIndex);
            
            if (clockwisePos === -1) {
                console.log(`  ❌ HTML位置 ${htmlIndex} 在順時鐘順序中找不到對應位置`);
                continue;
            }
            
            const prize = positionToPrize[clockwisePos];
            
            if (!prize) {
                console.log(`  ❌ 順時鐘位置 ${clockwisePos} 沒有對應的獎項`);
                continue;
            }
            
            gridHTML += `
                <div class="grid-item" data-prize-id="${prize.id}" data-clockwise-pos="${clockwisePos}">
                    ${prize.name}
                </div>
            `;
            
            console.log(`  順時鐘位置 ${clockwisePos} → HTML位置 ${htmlIndex}: ${prize.name} (${prize.id})`);
        }
    }
    
    lotteryGrid.innerHTML = gridHTML;
    
    // 保存配置
    window.clockwiseOrder = clockwiseOrder;
    window.lotteryPrizes = validPrizes;
    window.positionToPrize = positionToPrize;
    
    // 驗證生成結果
    console.log('🔍 驗證順時鐘九宮格最終配置:');
    const uniquePrizes = new Set();
    
    // 檢查每個順時鐘位置
    for (let clockwisePos = 0; clockwisePos < clockwiseOrder.length; clockwisePos++) {
        const htmlIndex = clockwiseOrder[clockwisePos];
        const gridItem = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
        
        console.log(`🔍 檢查順時鐘位置 ${clockwisePos} → HTML索引 ${htmlIndex}`);
        
        if (gridItem) {
            const prizeId = gridItem.dataset.prizeId;
            const content = gridItem.textContent.trim();
            const storedPos = gridItem.dataset.clockwisePos;
            
            console.log(`  順時鐘位置 ${clockwisePos}: ${content} (${prizeId}) [HTML索引:${htmlIndex}] [儲存位置:${storedPos}]`);
            uniquePrizes.add(prizeId);
            
            // 驗證儲存的位置是否正確
            if (parseInt(storedPos) !== clockwisePos) {
                console.log(`  ⚠️ 位置不一致: 預期 ${clockwisePos}, 實際儲存 ${storedPos}`);
            }
        } else {
            console.log(`  ❌ 找不到 HTML索引 ${htmlIndex} 的元素`);
        }
    }
    
    // 額外檢查：列出所有實際存在的格子
    console.log('🔍 額外檢查 - 所有實際存在的格子:');
    const allGridItems = document.querySelectorAll('#lotteryGrid .grid-item:not(.center)');
    allGridItems.forEach((item, index) => {
        const prizeId = item.dataset.prizeId;
        const content = item.textContent.trim();
        const storedPos = item.dataset.clockwisePos;
        console.log(`  格子 ${index}: ${content} (${prizeId}) [儲存位置:${storedPos}]`);
    });
    
    console.log(`✅ 順時鐘九宮格生成完成 - 顯示了 ${uniquePrizes.size} 種不同獎項`);
    console.log(`📊 獎項分佈統計:`, Array.from(uniquePrizes));
    
    // 檢查是否有缺失的位置
    const missingPositions = [];
    for (let i = 0; i < 8; i++) {
        const htmlIndex = clockwiseOrder[i];
        const gridItem = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
        if (!gridItem) {
            missingPositions.push(i);
        }
    }
    
    if (missingPositions.length > 0) {
        console.log(`❌ 缺失的順時鐘位置: [${missingPositions.join(', ')}]`);
    } else {
        console.log(`✅ 所有8個順時鐘位置都正確生成`);
    }
}

// 查找順時鐘中獎位置
function findWinnerPosition(prizeId) {
    console.log(`🎯 查找獎項 ${prizeId} 的順時鐘位置...`);
    
    const clockwiseOrder = window.clockwiseOrder || [0, 1, 2, 5, 8, 7, 6, 3];
    const matchingPositions = []; // 存儲所有匹配的位置
    
    console.log('🔍 當前順時鐘九宮格配置:');
    for (let clockwisePos = 0; clockwisePos < clockwiseOrder.length; clockwisePos++) {
        const htmlIndex = clockwiseOrder[clockwisePos];
        const gridItem = document.querySelector(`#lotteryGrid .grid-item:nth-child(${htmlIndex + 1})`);
        
        if (gridItem && !gridItem.classList.contains('center')) {
            const itemPrizeId = gridItem.dataset.prizeId;
            const itemContent = gridItem.textContent.trim();
            const storedClockwisePos = gridItem.dataset.clockwisePos;
            
            console.log(`  順時鐘位置 ${clockwisePos}: ${itemContent} (ID: ${itemPrizeId}) [HTML索引:${htmlIndex}] [儲存位置:${storedClockwisePos}]`);
            
            if (itemPrizeId === prizeId) {
                matchingPositions.push(clockwisePos);
            }
        }
    }
    
    if (matchingPositions.length > 0) {
        // 如果有多個匹配位置，隨機選擇一個
        const selectedPosition = matchingPositions[Math.floor(Math.random() * matchingPositions.length)];
        console.log(`✅ 找到 ${matchingPositions.length} 個匹配位置: [${matchingPositions.join(', ')}]`);
        console.log(`🎲 隨機選擇順時鐘位置: ${selectedPosition}`);
        return selectedPosition;
    }
    
    console.log(`❌ 找不到獎項 ${prizeId}，檢查所有可能的匹配...`);
    
    // 備用搜尋：檢查所有格子
    const allGridItems = document.querySelectorAll('.grid-item:not(.center)');
    const backupMatches = [];
    
    for (let i = 0; i < allGridItems.length; i++) {
        const item = allGridItems[i];
        const itemPrizeId = item.dataset.prizeId;
        const clockwisePos = parseInt(item.dataset.clockwisePos) || 0;
        
        console.log(`  備用搜尋 - 格子${i}: ${item.textContent.trim()} (${itemPrizeId}) [順時鐘位置:${clockwisePos}]`);
        
        if (itemPrizeId === prizeId) {
            backupMatches.push(clockwisePos);
        }
    }
    
    if (backupMatches.length > 0) {
        const selectedPosition = backupMatches[Math.floor(Math.random() * backupMatches.length)];
        console.log(`✅ 備用搜尋找到 ${backupMatches.length} 個匹配! 選擇順時鐘位置 ${selectedPosition}`);
        return selectedPosition;
    }
    
    console.log(`❌ 完全找不到獎項 ${prizeId}，使用預設位置 0`);
    return 0; // 預設第一個位置
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
        
        // 開始動畫
        animate();
    });
}

// 處理獎項自動兌換（背景處理，不阻塞UI）
async function handlePrizeExchange(prizeData) {
    try {
        console.log('🔄 開始背景處理獎項兌換:', prizeData);
        
        // 背景調用後端API，將中獎獎項自動兌換為商品
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
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ 獎項兌換成功:', result);
            
            // 更新相關快取
            cache.clear('exchangedResult');
            cache.clear('lotteryHistory');
            
            // 標記需要更新的頁面
            smartUpdateSystem.markForUpdate(['exchangedPage', 'lotteryHistoryPage']);
            
            // 如果用戶正在相關頁面，背景更新
            const currentPage = document.querySelector('.page-content.active')?.id;
            if (currentPage === 'exchangedPage' || currentPage === 'lotteryHistoryPage') {
                smartUpdateSystem.backgroundUpdate([currentPage]);
            }
            
            // 給用戶一個輕微的成功提示（如果中獎彈窗還在顯示）
            const resultModal = document.getElementById('lotteryResultModal');
            if (resultModal && resultModal.style.display === 'flex') {
                const claimNotice = resultModal.querySelector('.claim-notice');
                if (claimNotice) {
                    claimNotice.innerHTML = `
                        <i class="bi bi-check-circle-fill"></i>
                        獎品已成功加入兌換商品，請至「我的兌換」查看
                    `;
                    claimNotice.style.background = 'rgba(34, 197, 94, 0.15)';
                    claimNotice.style.color = '#16a34a';
                }
            }
            
        } else {
            console.log('⚠️ 獎項兌換失敗:', result.error || '未知錯誤');
            // 兌換失敗不影響用戶體驗，只記錄日誌
        }
        
    } catch (error) {
        console.error('❌ 獎項兌換網路錯誤:', error);
        // 網路錯誤也不影響用戶體驗，只記錄日誌
    }
}

// 顯示抽獎結果彈窗
function showLotteryResult(result) {
    const resultModal = document.getElementById('lotteryResultModal');
    const resultContent = document.getElementById('lotteryResultContent');
    
    if (!resultModal || !resultContent) return;
    
    let resultHTML = '';
    let modalClass = '';
    
    if (result.isThanks) {
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
                </div>
                <div class="remaining-tickets">
                    <i class="bi bi-ticket-perforated"></i>
                    剩餘抽獎券: ${result.remainingTickets} 張
                </div>
                <div class="claim-notice">
                    <i class="bi bi-check-circle-fill"></i>
                    獎品正在處理中，稍後可至「我的兌換」查看
                </div>
            </div>
        `;
    }
    
    resultContent.innerHTML = resultHTML;
    resultModal.className = `lottery-modal ${modalClass}`;
    resultModal.style.display = 'flex';
    
    // 立即播放動畫效果
    resultModal.classList.add('show');
}

// 關閉抽獎結果彈窗
function closeLotteryResult() {
    const resultModal = document.getElementById('lotteryResultModal');
    if (resultModal) {
        resultModal.classList.remove('show');
        setTimeout(() => {
            resultModal.style.display = 'none';
        }, 150);
    }
}

// 載入抽獎歷史
async function loadLotteryHistory() {
    const historyList = document.getElementById('lotteryHistoryList');
    
    // 先檢查快取
    const cachedHistory = cache.get('lotteryHistory');
    if (cachedHistory) {
        console.log('✅ 使用抽獎歷史快取資料，立即顯示');
        displayLotteryHistory(cachedHistory);
        return;
    }
    
    // 沒有快取時才顯示載入畫面
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
            cache.set('lotteryHistory', result.data, 180000); // 3分鐘快取
            displayLotteryHistory(result.data);
        } else {
            historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有抽獎紀錄</div>';
        }
    } catch (error) {
        console.error('載入抽獎歷史失敗:', error);
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
function displayLotteryHistory(historyData) {
    const historyList = document.getElementById('lotteryHistoryList');
    
    if (historyData && historyData.length > 0) {
        historyList.innerHTML = historyData.map(item => {
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
                                    <i class="bi ${statusIcon}"></i> ${statusText}
                                </span>
                            </div>
                            <div class="draw-time text-muted small">
                                <i class="bi bi-clock"></i> ${formatDateTime(item.drawTime)}
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
        }).join('');
    } else {
        historyList.innerHTML = '<div class="text-center text-muted py-4">目前沒有抽獎紀錄</div>';
    }
}

// 重新整理抽獎頁面（使用智能更新）
function refreshLotteryPage() {
    // 強制清除快取並重新載入
    cache.clear('lotteryTickets');
    cache.clear('lotteryPrizes');
    cache.clear('lotteryHistory');
    
    // 標記強制更新
    smartUpdateSystem.markForUpdate(['lottery', 'lottery-history']);
    
    // 重新載入抽獎頁面
    loadLotteryPage();
    
    console.log('🔄 抽獎頁面已刷新');
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
            console.log(`✅ 已修正中獎顯示到正確位置: 順時鐘位置 ${correctPosition} (HTML索引 ${htmlIndex})`);
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
        
        console.log('🎯 跑燈動畫開始，等待控制信號...');
        console.log('📋 九宮格元素數量:', allGridItems.length);
        
        function tick() {
            // 清除當前高亮
            allGridItems.forEach(item => item.classList.remove('running'));
            
            // 高亮當前位置 - 使用正確的HTML索引
            const htmlIndex = clockwiseOrder[currentPos];
            const currentElement = allGridItems[htmlIndex];
            if (currentElement && !currentElement.classList.contains('center')) {
                currentElement.classList.add('running');
                console.log(`🔄 跑燈步驟 ${totalSteps}: 順時鐘位置 ${currentPos} -> HTML位置 ${htmlIndex}`);
            } else {
                console.log(`❌ 無法找到HTML位置 ${htmlIndex} 的元素`);
            }
            
            // 檢查是否收到停止信號
            if (controller.shouldStop && totalSteps >= 16) { // 至少跑2圈才能停
                if (controller.targetPosition >= 0) {
                    // 計算還需要多少步到達目標位置
                    let stepsToTarget = (controller.targetPosition - currentPos + 8) % 8;
                    if (stepsToTarget === 0 && currentPos !== controller.targetPosition) {
                        stepsToTarget = 8; // 完整再跑一圈
                    }
                    
                    console.log(`🎯 收到停止信號，當前位置: ${currentPos}，目標位置: ${controller.targetPosition}，還需 ${stepsToTarget} 步`);
                    
                    // 開始減速停止動畫
                    runStopAnimation(currentPos, controller.targetPosition, stepsToTarget, allGridItems, resolve);
                } else {
                    // 隨機停止
                    const randomTarget = Math.floor(Math.random() * 8);
                    let stepsToTarget = (randomTarget - currentPos + 8) % 8;
                    if (stepsToTarget === 0) stepsToTarget = 8;
                    
                    console.log(`🎲 隨機停止，目標位置: ${randomTarget}，還需 ${stepsToTarget} 步`);
                    runStopAnimation(currentPos, randomTarget, stepsToTarget, allGridItems, resolve);
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
function runStopAnimation(startPos, targetPos, steps, allGridItems, resolve) {
    const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3];
    let currentPos = startPos;
    let remainingSteps = steps;
    
    function stopTick() {
        if (remainingSteps <= 0) {
            // 最終停止
            allGridItems.forEach(item => item.classList.remove('running'));
            const finalHtmlIndex = clockwiseOrder[targetPos];
            const finalElement = allGridItems[finalHtmlIndex];
            if (finalElement && !finalElement.classList.contains('center')) {
                finalElement.classList.add('winner');
                console.log(`🏆 跑燈停止於順時鐘位置 ${targetPos} (HTML位置 ${finalHtmlIndex})`);
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
            speed = 300; // 最後兩步很慢
        } else if (remainingSteps <= 4) {
            speed = 200; // 倒數四步慢
        } else {
            speed = 120 + (progress * 80); // 漸進減速
        }
        
        console.log(`⏰ 減速步驟，剩餘: ${remainingSteps}，速度: ${speed}ms`);
        setTimeout(stopTick, speed);
    }
    
    stopTick();
}

// 預生成九宮格配置（不渲染DOM，只計算配置）
function preGenerateLotteryGrid(prizes) {
    console.log('🎯 預生成九宮格配置...');
    
    if (!prizes || prizes.length === 0) {
        console.log('⚠️ 沒有獎項資料，跳過預生成');
        return;
    }
    
    // 過濾有效獎項
    const validPrizes = prizes.filter(p => p.remainingQuantity > 0);
    console.log(`📊 預生成: 原始 ${prizes.length} 個獎項 → 有效 ${validPrizes.length} 個獎項`);
    
    if (validPrizes.length === 0) {
        console.log('❌ 沒有有效獎項，跳過預生成');
        return;
    }
    
    // 順時鐘HTML位置映射
    const clockwiseOrder = [0, 1, 2, 5, 8, 7, 6, 3];
    
    // 智能分配獎項到8個位置
    const positionToPrize = {};
    const totalPositions = 8;
    
    if (validPrizes.length >= totalPositions) {
        // 獎項數量 >= 8個，取前8個
        for (let i = 0; i < totalPositions; i++) {
            positionToPrize[i] = validPrizes[i];
        }
    } else {
        // 獎項數量 < 8個，智能填充
        // 首先分配所有不同的獎項
        for (let i = 0; i < validPrizes.length; i++) {
            positionToPrize[i] = validPrizes[i];
        }
        
        // 對剩餘位置進行填充
        const remainingPositions = totalPositions - validPrizes.length;
        
        if (remainingPositions > 0) {
            const thanksItem = validPrizes.find(p => p.id === 'THANKS');
            const nonThanksItems = validPrizes.filter(p => p.id !== 'THANKS');
            
            for (let i = 0; i < remainingPositions; i++) {
                const positionIndex = validPrizes.length + i;
                
                if (thanksItem && i < Math.ceil(remainingPositions / 2)) {
                    positionToPrize[positionIndex] = thanksItem;
                } else if (nonThanksItems.length > 0) {
                    const fillIndex = i % nonThanksItems.length;
                    positionToPrize[positionIndex] = nonThanksItems[fillIndex];
                } else {
                    positionToPrize[positionIndex] = validPrizes[0];
                }
            }
        }
    }
    
    // 保存預生成的配置到快取
    const gridConfig = {
        clockwiseOrder,
        validPrizes,
        positionToPrize,
        timestamp: Date.now()
    };
    
    cache.set('preGeneratedLotteryGrid', gridConfig, 600000); // 10分鐘快取
    console.log('✅ 九宮格配置預生成完成');
}

// 從預生成配置快速渲染九宮格
function renderLotteryGridFromConfig(config, lotteryGrid) {
    const { clockwiseOrder, validPrizes, positionToPrize } = config;
    
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
    window.lotteryPrizes = validPrizes;
    window.positionToPrize = positionToPrize;
    
    console.log('⚡ 九宮格快速渲染完成');
}