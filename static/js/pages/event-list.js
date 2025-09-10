/* ========================================
   Event List Page JavaScript
   ======================================== */

let eventsData = [];

// Initialize event list page
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/events' || window.location.pathname.includes('event-list')) {
        initializeEventList();
        setupEventModal();
    }
});

async function initializeEventList() {
    // Events data should be available from server-side rendering
    // This function can be used for future dynamic loading if needed
    console.log('Event list page initialized');
}

function setupEventModal() {
    const eventModal = document.getElementById('eventModal');
    if (!eventModal) return;

    eventModal.addEventListener('show.bs.modal', function (event) {
        const button = event.relatedTarget;
        const eventData = JSON.parse(button.getAttribute('data-event'));
        
        populateEventModal(eventData);
    });
}

function populateEventModal(event) {
    // Update modal logo
    const logoImg = document.getElementById('modalEventLogo');
    if (logoImg) {
        if (event.logo) {
            logoImg.src = event.logo;
            logoImg.style.display = 'block';
            logoImg.style.maxWidth = '200px';
            logoImg.style.height = 'auto';
        } else {
            logoImg.style.display = 'none';
        }
    }
    
    // Update basic event information
    updateModalElement('modalEventTitle', event.title);
    updateModalElement('modalEventOrganizer', event.organizer || 'Unknown Organizer');
    
    // Format and update date range
    if (event.timelines && event.timelines.length > 0) {
        const startDate = new Date(event.timelines[0].startTime).toLocaleDateString();
        const endDate = new Date(event.timelines[event.timelines.length - 1].endTime).toLocaleDateString();
        updateModalElement('modalEventDateRange', `${startDate} - ${endDate}`);
    } else {
        updateModalElement('modalEventDateRange', 'N/A');
    }
    
    // Update format and restrictions
    updateModalElement('modalEventFormat', formatBadges(event.format || [], 'primary'));
    updateModalElement('modalEventRestrictions', formatBadges(event.restrictions || [], 'warning'));
    
    // Update event URL
    const urlLink = document.getElementById('modalEventURL');
    if (urlLink && event.url) {
        urlLink.href = event.url;
        urlLink.style.display = 'inline-block';
    } else if (urlLink) {
        urlLink.style.display = 'none';
    }
    
    // Update description (support markdown)
    updateEventDescription(event.description || 'No description available.');
    
    // Update timeline table
    updateTimelineTable(event.timelines || []);
}

function updateModalElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
        element.innerHTML = content;
    }
}

function formatBadges(items, badgeType) {
    if (!items || items.length === 0) {
        return '<span class="text-muted">None</span>';
    }
    
    return items.map(item => 
        `<span class="badge bg-${badgeType} me-1">${escapeHtml(item)}</span>`
    ).join('');
}

function updateEventDescription(description) {
    const descElement = document.getElementById('modalEventDescription');
    if (!descElement) return;
    
    // Basic markdown support - convert **bold** and *italic*
    let formattedDescription = escapeHtml(description);
    formattedDescription = formattedDescription.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedDescription = formattedDescription.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formattedDescription = formattedDescription.replace(/\n/g, '<br>');
    
    descElement.innerHTML = formattedDescription;
}

function updateTimelineTable(timelines) {
    const timelineBody = document.getElementById('modalEventTimelines');
    if (!timelineBody) return;
    
    if (!timelines || timelines.length === 0) {
        timelineBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No timeline information available</td></tr>';
        return;
    }
    
    const timelineRows = timelines.map(timeline => {
        const startTime = new Date(timeline.startTime).toLocaleString();
        const endTime = new Date(timeline.endTime).toLocaleString();
        
        return `
            <tr>
                <td><strong>${escapeHtml(timeline.name || 'Event Phase')}</strong></td>
                <td>${startTime}</td>
                <td>${endTime}</td>
                <td><span class="badge bg-secondary">${escapeHtml(timeline.timezone || 'UTC')}</span></td>
                <td>${escapeHtml(timeline.location || 'Online')}</td>
            </tr>
        `;
    }).join('');
    
    timelineBody.innerHTML = timelineRows;
}

function refreshEvents() {
    // Reload the page to get fresh event data
    window.location.reload();
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions for global access
window.refreshEvents = refreshEvents;

