// Session Status Page JavaScript
let statusData = null;

async function refreshStatus() {
    try {
        showLoading('status-container', true);
        const response = await fetch('/session-status');
        statusData = await response.json();
        updateStatusDisplay();
    } catch (error) {
        console.error('Failed to refresh status:', error);
        showAlert('Failed to refresh status', 'danger');
    } finally {
        showLoading('status-container', false);
    }
}

function updateStatusDisplay() {
    if (!statusData) return;
    
    // Update bot status
    const botStatus = document.getElementById('bot-status');
    const botUptime = document.getElementById('bot-uptime');
    
    if (botStatus) {
        const isOnline = statusData.bot.isReady;
        const statusClass = isOnline ? 'status-online' : 'status-offline';
        const statusText = isOnline ? 'Online' : 'Offline';
        const statusIcon = isOnline ? 'bi-check-circle' : 'bi-x-circle';
        
        botStatus.innerHTML = `
            <span class="status-indicator ${statusClass}">
                <i class="bi ${statusIcon}"></i>
                ${statusText}
            </span>
        `;
    }
    
    if (botUptime) {
        const uptime = statusData.bot.uptime ? formatUptime(statusData.bot.uptime) : 'N/A';
        botUptime.textContent = uptime;
    }
    
    // Update session scheduler status
    const sessionStatus = document.getElementById('session-status');
    const remainingSessions = document.getElementById('remaining-sessions');
    const resetTime = document.getElementById('reset-time');
    
    if (sessionStatus && statusData.sessionScheduler) {
        const isActive = statusData.sessionScheduler.isActive;
        const isWaiting = statusData.sessionScheduler.isWaitingForSessionReset;
        
        let statusClass = 'status-offline';
        let statusText = 'Inactive';
        let statusIcon = 'bi-x-circle';
        
        if (isActive) {
            statusClass = 'status-online';
            statusText = 'Active';
            statusIcon = 'bi-check-circle';
        } else if (isWaiting) {
            statusClass = 'status-waiting';
            statusText = 'Waiting for Reset';
            statusIcon = 'bi-clock';
        }
        
        sessionStatus.innerHTML = `
            <span class="status-indicator ${statusClass}">
                <i class="bi ${statusIcon}"></i>
                ${statusText}
            </span>
        `;
    }
    
    if (remainingSessions && statusData.sessionScheduler?.sessionInfo) {
        const remaining = statusData.sessionScheduler.sessionInfo.remainingSessions;
        const total = statusData.sessionScheduler.sessionInfo.totalSessions;
        remainingSessions.textContent = `${remaining}/${total}`;
    }
    
    if (resetTime && statusData.sessionScheduler?.sessionInfo) {
        const resetTimeMs = statusData.sessionScheduler.sessionInfo.timeUntilReset;
        const resetTimeFormatted = resetTimeMs > 0 ? formatUptime(resetTimeMs / 1000) : 'Now';
        resetTime.textContent = resetTimeFormatted;
    }
    
    // Update raw JSON
    const jsonContainer = document.getElementById('raw-json');
    if (jsonContainer) {
        jsonContainer.textContent = JSON.stringify(statusData, null, 2);
    }
    
    // Update timestamp
    const timestamp = document.getElementById('last-update');
    if (timestamp) {
        timestamp.textContent = new Date().toLocaleString();
    }
}

function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
}

// Auto-refresh every 5 seconds
document.addEventListener('DOMContentLoaded', function() {
    refreshStatus();
    setInterval(refreshStatus, 5000);
});
