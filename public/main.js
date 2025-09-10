/* ========================================
   CTF Assistant - Main JavaScript
   ======================================== */

// Global variables
window.CTFAssistant = {
    charts: {},
    currentPage: null,
    user: null
};

// Load user info on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadUserInfo();
});

async function loadUserInfo() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            window.CTFAssistant.user = await response.json();
            updateUserUI();
        }
    } catch (error) {
        console.log('User not authenticated or error loading user info');
    }
}

function updateUserUI() {
    const user = window.CTFAssistant.user;
    if (!user) return;
    
    // Update welcome message
    const welcomeElements = document.querySelectorAll('#welcome-user');
    welcomeElements.forEach(el => {
        el.textContent = `Welcome, ${user.username}!`;
    });
    
    // Update profile username
    const profileUsername = document.getElementById('profile-username');
    if (profileUsername) {
        profileUsername.textContent = user.username;
    }
    
    // Hide admin links if not admin
    if (!user.isAdmin) {
        const adminLinks = document.querySelectorAll('a[href*="/admin"]');
        adminLinks.forEach(link => {
            link.style.display = 'none';
        });
    }
}

/* ========================================
   Utility Functions
   ======================================== */

// Show alert messages
function showAlert(message, type = 'info', duration = 5000) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.querySelector('.main-content') || document.body;
    container.prepend(alertDiv);
    
    if (duration > 0) {
        setTimeout(() => {
            const alert = bootstrap.Alert.getOrCreateInstance(alertDiv);
            alert.close();
        }, duration);
    }
}

// Show/hide loading state
function showLoading(element, show = true) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    
    if (!element) return;
    
    if (show) {
        const loadingHTML = `
            <div class="loading-overlay d-flex align-items-center justify-content-center">
                <div class="text-center">
                    <div class="loading"></div>
                    <p class="text-muted mt-2">Loading...</p>
                </div>
            </div>
        `;
        element.style.position = 'relative';
        element.insertAdjacentHTML('beforeend', loadingHTML);
    } else {
        const loadingOverlay = element.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }
}

// Format date for display
function formatDate(date, options = {}) {
    if (!date) return '-';
    
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/* ========================================
   API Helper Functions
   ======================================== */

// Generic API call wrapper
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`API call failed for ${endpoint}:`, error);
        throw error;
    }
}

// Get dashboard statistics
async function getDashboardStats() {
    return await apiCall('/api/dashboard/stats');
}

// Get CTF events
async function getCTFEvents() {
    return await apiCall('/api/ctf-events');
}

/* ========================================
   Dashboard Functions
   ======================================== */

let statsChart = null;

async function refreshStats() {
    try {
        const data = await getDashboardStats();
        updateDashboard(data);
        showAlert('Dashboard refreshed successfully!', 'success');
    } catch (error) {
        console.error('Failed to refresh stats:', error);
        showAlert('Failed to refresh stats', 'danger');
    }
}

function updateDashboard(data) {
    // Update metric cards
    const elements = {
        'total-events': data.totalEvents || 0,
        'total-solves': data.totalSolves || 0,
        'active-events': data.activeEvents || 0,
        'bot-status': data.botOnline ? 'Online' : 'Offline'
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
    
    // Update bot status color
    const statusElement = document.getElementById('bot-status');
    if (statusElement) {
        statusElement.className = `metric-number ${data.botOnline ? 'text-success' : 'text-danger'}`;
    }
    
    // Update recent activity
    updateRecentActivity(data.recentActivity || []);
    
    // Update chart
    updateChart(data.chartData || []);
}

function updateRecentActivity(activities) {
    const container = document.getElementById('recent-activity');
    if (!container) return;
    
    if (activities.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">No recent activity</p>';
        return;
    }
    
    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon activity-${activity.type}">
                <i class="bi bi-${activity.icon}"></i>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold">${activity.title}</div>
                <div class="text-muted small">${activity.description}</div>
                <div class="text-muted small">${formatDate(activity.timestamp)}</div>
            </div>
        </div>
    `).join('');
}

function updateChart(data) {
    const ctx = document.getElementById('statsChart');
    if (!ctx) return;
    
    if (statsChart) {
        statsChart.destroy();
    }
    
    statsChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.map(d => d.date) || [],
            datasets: [{
                label: 'Solves',
                data: data.map(d => d.solves) || [],
                borderColor: '#bb86fc',
                backgroundColor: 'rgba(187, 134, 252, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
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
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255,255,255,0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255,255,255,0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

/* ========================================
   Data Page Functions
   ======================================== */

let currentFilter = 'all';
let currentPage = 1;
let itemsPerPage = 10;

async function refreshData() {
    try {
        showLoading('events-table', true);
        const data = await getCTFEvents();
        updateEventsTable(data);
        
        // Update statistics
        const totalEventsElement = document.getElementById('total-events-count');
        const eventsCountElement = document.getElementById('events-count');
        
        if (totalEventsElement) totalEventsElement.textContent = data.length;
        if (eventsCountElement) eventsCountElement.textContent = `${data.length} events`;
        
        // Calculate total solves and active solvers
        const totalSolves = data.reduce((sum, event) => sum + (event.solves || 0), 0);
        const totalSolvesElement = document.getElementById('total-solves-count');
        const activeSolversElement = document.getElementById('active-solvers-count');
        
        if (totalSolvesElement) totalSolvesElement.textContent = totalSolves;
        if (activeSolversElement) activeSolversElement.textContent = '0'; // TODO: Calculate unique solvers
        
    } catch (error) {
        console.error('Failed to refresh data:', error);
        showAlert('Failed to refresh data', 'danger');
    } finally {
        showLoading('events-table', false);
    }
}

function updateEventsTable(events) {
    const tbody = document.getElementById('events-tbody');
    if (!tbody) return;
    
    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No events found</td></tr>';
        return;
    }
    
    // Filter events based on current filter
    let filteredEvents = events;
    if (currentFilter !== 'all') {
        filteredEvents = events.filter(event => event.status === currentFilter);
    }
    
    // Pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedEvents = filteredEvents.slice(startIndex, endIndex);
    
    tbody.innerHTML = paginatedEvents.map(event => `
        <tr onclick="viewEventDetails('${event.id}')" style="cursor: pointer;">
            <td>
                <div class="fw-bold">${event.title}</div>
                <small class="text-muted">${event.organizer || 'Unknown'}</small>
            </td>
            <td>
                <span class="badge status-${event.status}">${event.status.charAt(0).toUpperCase() + event.status.slice(1)}</span>
            </td>
            <td>${formatDate(event.start_date, { hour: undefined, minute: undefined })}</td>
            <td>${formatDate(event.finish_date, { hour: undefined, minute: undefined })}</td>
            <td>
                <span class="solve-badge">${event.solves || 0} solves</span>
            </td>
            <td>
                <div class="dropdown">
                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" onclick="event.stopPropagation()">Actions</button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="#" onclick="viewEventDetails('${event.id}'); event.stopPropagation();"><i class="bi bi-eye me-2"></i>View Details</a></li>
                        <li><a class="dropdown-item" href="#" onclick="exportEventData('${event.id}'); event.stopPropagation();"><i class="bi bi-download me-2"></i>Export</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" onclick="deleteEvent('${event.id}'); event.stopPropagation();"><i class="bi bi-trash me-2"></i>Delete</a></li>
                    </ul>
                </div>
            </td>
        </tr>
    `).join('');
    
    updatePagination(filteredEvents.length);
}

function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
            </li>
        `;
    }
    
    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    currentPage = page;
    refreshData();
}

function filterData(filter) {
    currentFilter = filter;
    currentPage = 1;
    refreshData();
}

function searchEvents() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const rows = document.querySelectorAll('#events-tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

async function exportData() {
    try {
        const response = await fetch('/api/export-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ctf-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('Data exported successfully', 'success');
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        showAlert('Failed to export data', 'danger');
    }
}

async function viewEventDetails(eventId) {
    try {
        const modal = new bootstrap.Modal(document.getElementById('eventDetailsModal'));
        await loadEventDetails(eventId);
        modal.show();
    } catch (error) {
        showAlert('Failed to load event details', 'danger');
    }
}

async function loadEventDetails(eventId) {
    try {
        const event = await getEventDetails(eventId);
        
        const elements = {
            'modal-event-title': event.title,
            'modal-event-description': event.description || 'No description available',
            'modal-event-organizer': event.organizer || 'Unknown',
            'modal-event-dates': `${formatDate(event.start_date)} - ${formatDate(event.finish_date)}`
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
        
        const urlElement = document.getElementById('modal-event-url');
        if (urlElement) {
            urlElement.innerHTML = event.url ? 
                `<a href="${event.url}" target="_blank" class="btn btn-sm btn-primary">Visit Event</a>` : 
                'No URL provided';
        }
        
        // Load solves for this event
        await loadEventSolves(eventId);
    } catch (error) {
        console.error('Failed to load event details:', error);
    }
}

async function loadEventSolves(eventId) {
    try {
        const solves = await getEventSolves(eventId);
        
        const solvesContainer = document.getElementById('modal-event-solves');
        if (!solvesContainer) return;
        
        if (solves.length === 0) {
            solvesContainer.innerHTML = '<p class="text-muted">No solves recorded</p>';
            return;
        }
        
        solvesContainer.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Challenge</th>
                            <th>Solver(s)</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${solves.map(solve => `
                            <tr>
                                <td>${solve.challenge}</td>
                                <td>${solve.users.join(', ')}</td>
                                <td>${formatDate(solve.createdAt)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load event solves:', error);
    }
}

function deleteEvent(eventId) {
    if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
        // TODO: Implement actual delete logic
        console.log('Delete event:', eventId);
        showAlert('Delete functionality not yet implemented', 'warning');
    }
}

function exportEventData(eventId) {
    // TODO: Implement event-specific export
    console.log('Export event data:', eventId);
    showAlert('Event export functionality not yet implemented', 'warning');
}

/* ========================================
   Form Validation
   ======================================== */

// Bootstrap form validation
function initFormValidation() {
    const forms = document.querySelectorAll('.needs-validation');
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });
}

/* ========================================
   Login Page Functions
   ======================================== */

function initLoginPage() {
    // Auto-focus username field
    const usernameField = document.getElementById('username');
    if (usernameField) {
        usernameField.focus();
    }
    
    // Initialize form validation
    initFormValidation();
}

/* ========================================
   Global Initialization
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Auto-dismiss alerts after 5 seconds
    setTimeout(() => {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            if (bsAlert) bsAlert.close();
        });
    }, 5000);
    
    // Add loading state to form buttons
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function() {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                const originalHTML = submitBtn.innerHTML;
                submitBtn.innerHTML = '<span class="loading"></span> Loading...';
                
                // Re-enable after 5 seconds as fallback
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalHTML;
                }, 5000);
            }
        });
    });
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // Initialize page-specific functionality
    const currentPath = window.location.pathname;
    
    if (currentPath === '/dashboard') {
        refreshStats();
        setInterval(refreshStats, 30000); // Auto-refresh every 30 seconds
    } else if (currentPath === '/data') {
        refreshData();
        
        // Setup search with debounce
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(searchEvents, 300));
        }
    } else if (currentPath === '/login') {
        initLoginPage();
    }
    
    // Initialize form validation for all pages
    initFormValidation();
});

/* ========================================
   Export for global access
   ======================================== */

// Make functions available globally
window.CTFAssistant = {
    ...window.CTFAssistant,
    showAlert,
    showLoading,
    formatDate,
    refreshStats,
    refreshData,
    filterData,
    searchEvents,
    exportData,
    viewEventDetails,
    changePage
};
