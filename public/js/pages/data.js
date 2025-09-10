/* ========================================
   Data Page JavaScript
   ======================================== */

let currentView = 'table';
let currentFilter = 'all';
let currentPage = 1;
let eventsData = [];

// Initialize data page
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/data') {
        loadEventsData();
        initializeSearchFilter();
    }
});

async function loadEventsData() {
    try {
        showTableLoading(true);
        const response = await fetch('/api/ctf-events');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        eventsData = await response.json();
        
        renderEvents();
        updatePagination();
    } catch (error) {
        console.error('Failed to load events:', error);
        showErrorState();
        showAlert('Failed to load events data. Please check your connection and try again.', 'danger');
    }
}

function filterData(filter) {
    currentFilter = filter;
    currentPage = 1;
    renderEvents();
    updatePagination();
}

function toggleView(view) {
    currentView = view;
    
    // Update button states
    document.getElementById('gridView').classList.toggle('active', view === 'grid');
    document.getElementById('tableView').classList.toggle('active', view === 'table');
    
    // Show/hide containers
    document.getElementById('grid-container').style.display = view === 'grid' ? 'flex' : 'none';
    document.getElementById('table-container').style.display = view === 'table' ? 'block' : 'none';
    
    renderEvents();
}

function initializeSearchFilter() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            renderEvents();
            updatePagination();
        }, 300);
    });
}

function renderEvents() {
    const filteredEvents = getFilteredEvents();
    
    if (currentView === 'table') {
        renderTableView(filteredEvents);
    } else {
        renderGridView(filteredEvents);
    }
}

function getFilteredEvents() {
    let filtered = eventsData;
    
    // Apply status filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(event => event.status === currentFilter);
    }
    
    // Apply search filter
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(event => 
            event.title.toLowerCase().includes(searchTerm) ||
            event.organizer.toLowerCase().includes(searchTerm) ||
            (event.description && event.description.toLowerCase().includes(searchTerm))
        );
    }
    
    return filtered;
}

function renderTableView(events) {
    const tbody = document.getElementById('eventsTableBody');
    
    if (!Array.isArray(events) || events.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <i class="bi bi-search mb-2" style="font-size: 2rem; color: var(--text-secondary);"></i>
                    <p class="text-muted">No events found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    const startIndex = (currentPage - 1) * 10;
    const endIndex = startIndex + 10;
    const pageEvents = events.slice(startIndex, endIndex);
    
    tbody.innerHTML = pageEvents.map(event => `
        <tr onclick="showEventDetails('${event.id}')" style="cursor: pointer;">
            <td>
                <div class="fw-bold">${event.title}</div>
                <small class="text-muted">${formatDate(event.startTime)} - ${formatDate(event.endTime)}</small>
            </td>
            <td>${event.organizer}</td>
            <td>
                <span class="event-status status-${event.status}">${capitalize(event.status)}</span>
            </td>
            <td>${calculateDuration(event.startTime, event.endTime)}</td>
            <td>
                <span class="solve-badge">${event.solves || 0} solves</span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editEvent('${event.id}')" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteEvent('${event.id}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderGridView(events) {
    const container = document.getElementById('grid-container');
    
    if (events.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-search mb-3" style="font-size: 3rem; color: var(--text-secondary);"></i>
                <h4 class="text-muted">No events found</h4>
                <p class="text-muted">Try adjusting your search or filter criteria</p>
            </div>
        `;
        return;
    }
    
    const startIndex = (currentPage - 1) * 12;
    const endIndex = startIndex + 12;
    const pageEvents = events.slice(startIndex, endIndex);
    
    container.innerHTML = pageEvents.map(event => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card data-card h-100" onclick="showEventDetails('${event.id}')" style="cursor: pointer;">
                <div class="card-body position-relative">
                    <span class="event-status status-${event.status}">${capitalize(event.status)}</span>
                    
                    <h5 class="card-title">${event.title}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">${event.organizer}</h6>
                    
                    <p class="card-text small">
                        ${event.description ? event.description.substring(0, 100) + '...' : 'No description available'}
                    </p>
                    
                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <small class="text-muted">
                            <i class="bi bi-calendar me-1"></i>
                            ${formatDate(event.startTime)}
                        </small>
                        <span class="solve-badge">${event.solves || 0} solves</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function updatePagination() {
    const filteredEvents = getFilteredEvents();
    const totalPages = Math.ceil(filteredEvents.length / (currentView === 'table' ? 10 : 12));
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    if (currentPage > 1) {
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a>
            </li>
        `;
    }
    
    // Page numbers
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        paginationHTML += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a>
            </li>
        `;
    }
    
    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    currentPage = page;
    renderEvents();
    updatePagination();
}

function showEventDetails(eventId) {
    const event = eventsData.find(e => e.id === eventId);
    if (!event) return;
    
    const modalBody = document.getElementById('eventModalBody');
    modalBody.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Event Information</h6>
                <p><strong>Title:</strong> ${event.title}</p>
                <p><strong>Organizer:</strong> ${event.organizer}</p>
                <p><strong>Status:</strong> <span class="event-status status-${event.status}">${capitalize(event.status)}</span></p>
                <p><strong>Duration:</strong> ${calculateDuration(event.startTime, event.endTime)}</p>
            </div>
            <div class="col-md-6">
                <h6>Statistics</h6>
                <p><strong>Total Solves:</strong> ${event.solves || 0}</p>
                <p><strong>Participants:</strong> ${event.participants || 0}</p>
                <p><strong>Categories:</strong> ${event.categories ? event.categories.join(', ') : 'N/A'}</p>
            </div>
        </div>
        <hr>
        <div>
            <h6>Description</h6>
            <p>${event.description || 'No description available'}</p>
        </div>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('eventModal'));
    modal.show();
}

async function exportData() {
    try {
        const response = await fetch('/api/export-data', {
            method: 'POST'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ctf-events-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('Data exported successfully!', 'success');
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        showAlert('Failed to export data', 'danger');
    }
}

async function refreshData() {
    await loadEventsData();
}

function showTableLoading(show = true) {
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    
    if (show) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="loading"></div>
                    <p class="text-muted mt-2">Loading events...</p>
                </td>
            </tr>
        `;
    }
    // When show = false, renderEvents() or showErrorState() will replace the content
}

function showErrorState() {
    const tbody = document.getElementById('eventsTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <div class="text-danger mb-3">
                        <i class="bi bi-exclamation-triangle display-1"></i>
                    </div>
                    <h4 class="text-danger">Failed to Load Events</h4>
                    <p class="text-muted mb-3">Unable to connect to the server or load event data.</p>
                    <button class="btn btn-primary" onclick="refreshData()">
                        <i class="bi bi-arrow-clockwise me-2"></i>Try Again
                    </button>
                </td>
            </tr>
        `;
    }
}

// Utility functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function calculateDuration(start, end) {
    const duration = new Date(end) - new Date(start);
    const hours = Math.floor(duration / (1000 * 60 * 60));
    return `${hours} hours`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
