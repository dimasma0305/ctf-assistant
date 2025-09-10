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

// Get event details
async function getEventDetails(eventId) {
    return await apiCall(`/api/event/${eventId}`);
}

// Get event solves  
async function getEventSolves(eventId) {
    return await apiCall(`/api/event/${eventId}/solves`);
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
   Data Page Functions (handled by data.js)
   ======================================== */

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
        const modal = new bootstrap.Modal(document.getElementById('eventModal'));
        await loadEventDetails(eventId);
        modal.show();
    } catch (error) {
        showAlert('Failed to load event details', 'danger');
    }
}

async function loadEventDetails(eventId) {
    try {
        const event = await getEventDetails(eventId);
        
        if (!event) {
            showAlert('Event not found', 'danger');
            return;
        }
        
        // Update modal content
        const modalBody = document.getElementById('eventModalBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <h6>Event Information</h6>
                        <p><strong>Title:</strong> ${event.title || 'N/A'}</p>
                        <p><strong>Organizer:</strong> ${event.organizer || 'Unknown'}</p>
                        <p><strong>Status:</strong> <span class="badge status-${event.status}">${event.status}</span></p>
                        <p><strong>Start Date:</strong> ${formatDate(event.start_date || event.startTime)}</p>
                        <p><strong>End Date:</strong> ${formatDate(event.finish_date || event.endTime)}</p>
                        <p><strong>Solves:</strong> ${event.solves || 0}</p>
                        ${event.url ? `<p><strong>URL:</strong> <a href="${event.url}" target="_blank" class="btn btn-sm btn-primary">Visit Event</a></p>` : ''}
                    </div>
                    <div class="col-md-6">
                        <h6>Description</h6>
                        <p>${event.description || 'No description available'}</p>
                    </div>
                </div>
            `;
        }
        
        // Load solves for this event
        await loadEventSolves(eventId);
    } catch (error) {
        console.error('Failed to load event details:', error);
        showAlert('Failed to load event details', 'danger');
    }
}

async function loadEventSolves(eventId) {
    try {
        const solves = await getEventSolves(eventId);
        
        // Update the modal with solves information
        const modalBody = document.getElementById('eventModalBody');
        if (!modalBody) return;
        
        // Add solves section to the existing modal content
        const solvesSection = document.createElement('div');
        solvesSection.className = 'mt-4';
        solvesSection.innerHTML = `
            <h6>Challenge Solves (${solves.length})</h6>
            ${solves.length === 0 ? 
                '<p class="text-muted">No solves recorded for this event</p>' : 
                `<div class="table-responsive">
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
                </div>`
            }
        `;
        
        modalBody.appendChild(solvesSection);
        
        console.log('Loaded', solves.length, 'solves for event:', eventId);
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
    exportData,
    viewEventDetails,
    deleteEvent,
    exportEventData
};
