/* ========================================
   Dashboard Page JavaScript
   ======================================== */

let solvesChart = null;
let categoryChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/dashboard') {
        initializeDashboard();
    }
});

async function initializeDashboard() {
    await Promise.all([
        loadDashboardStats(),
        loadCharts(),
        loadRecentActivity()
    ]);
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const stats = await response.json();
        
        document.getElementById('total-events').textContent = stats.totalEvents || 0;
        document.getElementById('total-solves').textContent = stats.totalSolves || 0;
        document.getElementById('active-events').textContent = stats.activeEvents || 0;
        document.getElementById('team-members').textContent = stats.teamMembers || 0;
        
        // Animate numbers
        animateNumbers();
    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
    }
}

async function loadCharts() {
    try {
        const [solvesData, categoryData] = await Promise.all([
            fetch('/api/dashboard/solves-chart').then(r => r.json()),
            fetch('/api/dashboard/category-chart').then(r => r.json())
        ]);
        
        initializeSolvesChart(solvesData);
        initializeCategoryChart(categoryData);
    } catch (error) {
        console.error('Failed to load chart data:', error);
    }
}

function initializeSolvesChart(data) {
    const ctx = document.getElementById('solvesChart').getContext('2d');
    
    if (solvesChart) {
        solvesChart.destroy();
    }
    
    solvesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels || [],
            datasets: [{
                label: 'Solves',
                data: data.values || [],
                borderColor: '#bb86fc',
                backgroundColor: 'rgba(187, 134, 252, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#bb86fc',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

function initializeCategoryChart(data) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (categoryChart) {
        categoryChart.destroy();
    }
    
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels || [],
            datasets: [{
                data: data.values || [],
                backgroundColor: [
                    '#bb86fc',
                    '#03dac6',
                    '#4caf50',
                    '#ff9800',
                    '#f44336',
                    '#2196f3',
                    '#9c27b0'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#b3b3b3',
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

async function loadRecentActivity() {
    try {
        const [eventsResponse, solvesResponse] = await Promise.all([
            fetch('/api/dashboard/recent-events'),
            fetch('/api/dashboard/latest-solves')
        ]);
        
        const recentEvents = await eventsResponse.json();
        const latestSolves = await solvesResponse.json();
        
        renderRecentEvents(recentEvents);
        renderLatestSolves(latestSolves);
    } catch (error) {
        console.error('Failed to load recent activity:', error);
    }
}

function renderRecentEvents(events) {
    const container = document.getElementById('recent-events');
    
    if (!events || events.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No recent events</p>';
        return;
    }
    
    container.innerHTML = events.slice(0, 5).map(event => `
        <div class="d-flex align-items-center mb-3 p-2 rounded" style="background-color: var(--surface-color);">
            <div class="me-3">
                <div class="rounded-circle d-flex align-items-center justify-content-center"
                     style="width: 40px; height: 40px; background-color: var(--primary-color);">
                    <i class="bi bi-calendar-event text-white"></i>
                </div>
            </div>
            <div class="flex-grow-1">
                <h6 class="mb-1">${event.title}</h6>
                <small class="text-muted">${event.organizer} • ${formatRelativeTime(event.startTime)}</small>
            </div>
            <div class="text-end">
                <span class="badge bg-${getStatusColor(event.status)}">${event.status}</span>
            </div>
        </div>
    `).join('');
}

function renderLatestSolves(solves) {
    const container = document.getElementById('latest-solves');
    
    if (!solves || solves.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No recent solves</p>';
        return;
    }
    
    container.innerHTML = solves.slice(0, 5).map(solve => `
        <div class="d-flex align-items-center mb-3 p-2 rounded" style="background-color: var(--surface-color);">
            <div class="me-3">
                <div class="rounded-circle d-flex align-items-center justify-content-center"
                     style="width: 40px; height: 40px; background-color: var(--success-color);">
                    <i class="bi bi-trophy text-white"></i>
                </div>
            </div>
            <div class="flex-grow-1">
                <h6 class="mb-1">${solve.challengeName}</h6>
                <small class="text-muted">${solve.category} • ${solve.points} points</small>
            </div>
            <div class="text-end">
                <small class="text-muted">${formatRelativeTime(solve.timestamp)}</small>
            </div>
        </div>
    `).join('');
}

async function refreshStats() {
    showLoading('total-events', true);
    showLoading('total-solves', true);
    showLoading('active-events', true);
    showLoading('team-members', true);
    
    await initializeDashboard();
    showAlert('Dashboard refreshed successfully!', 'success');
}

// Utility functions
function animateNumbers() {
    const numbers = document.querySelectorAll('.metric-number');
    numbers.forEach(numberEl => {
        const target = parseInt(numberEl.textContent);
        if (isNaN(target)) return;
        
        let current = 0;
        const increment = target / 50;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                numberEl.textContent = target;
                clearInterval(timer);
            } else {
                numberEl.textContent = Math.floor(current);
            }
        }, 30);
    });
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function getStatusColor(status) {
    const colors = {
        'active': 'success',
        'completed': 'secondary',
        'upcoming': 'primary',
        'cancelled': 'danger'
    };
    return colors[status] || 'secondary';
}
