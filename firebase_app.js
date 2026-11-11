// UI更新函數（需要添加到原始app.js中）
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
                <span class="badge badge-success">+${activity.points} 點數</span>
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