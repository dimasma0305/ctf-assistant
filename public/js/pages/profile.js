/* ========================================
   Profile Page JavaScript
   ======================================== */

async function saveProfile() {
    const profileData = {
        displayName: document.getElementById('display-name').value,
        email: document.getElementById('email').value,
        bio: document.getElementById('bio').value,
        timezone: document.getElementById('timezone').value,
        theme: document.getElementById('theme').value,
        notifications: {
            emailSolves: document.getElementById('email-solves').checked,
            emailEvents: document.getElementById('email-events').checked,
            discordDM: document.getElementById('discord-dm').checked
        },
        privacy: {
            showEmail: document.getElementById('show-email').checked,
            showStats: document.getElementById('show-stats').checked,
            showActivity: document.getElementById('show-activity').checked
        }
    };
    
    try {
        const response = await fetch('/api/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profileData)
        });
        
        if (response.ok) {
            showAlert('Profile updated successfully!', 'success');
            loadProfile(); // Refresh profile data
        } else {
            throw new Error('Failed to save profile');
        }
    } catch (error) {
        showAlert('Failed to update profile', 'danger');
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'warning');
        return;
    }
    
    if (newPassword.length < 8) {
        showAlert('Password must be at least 8 characters long', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        if (response.ok) {
            showAlert('Password changed successfully!', 'success');
            // Clear password fields
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to change password');
        }
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function loadProfile() {
    try {
        const response = await fetch('/api/profile');
        const profile = await response.json();
        
        // Update profile form with loaded data
        document.getElementById('display-name').value = profile.displayName || '';
        document.getElementById('email').value = profile.email || '';
        document.getElementById('bio').value = profile.bio || '';
        document.getElementById('timezone').value = profile.timezone || 'UTC';
        document.getElementById('theme').value = profile.theme || 'light';
        
        // Update notification preferences
        document.getElementById('email-solves').checked = profile.notifications?.emailSolves || false;
        document.getElementById('email-events').checked = profile.notifications?.emailEvents || false;
        document.getElementById('discord-dm').checked = profile.notifications?.discordDM || false;
        
        // Update privacy settings
        document.getElementById('show-email').checked = profile.privacy?.showEmail || false;
        document.getElementById('show-stats').checked = profile.privacy?.showStats !== false; // Default true
        document.getElementById('show-activity').checked = profile.privacy?.showActivity !== false; // Default true
        
        // Update stats
        updateProfileStats(profile.stats || {});
        updateRecentActivity(profile.recentActivity || []);
        
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

function updateProfileStats(stats) {
    document.getElementById('total-solves').textContent = stats.totalSolves || 0;
    document.getElementById('events-participated').textContent = stats.eventsParticipated || 0;
    document.getElementById('challenges-created').textContent = stats.challengesCreated || 0;
    document.getElementById('success-rate').textContent = (stats.successRate || 0) + '%';
    
    // Update progress bars
    const successRate = stats.successRate || 0;
    document.getElementById('success-progress').style.width = successRate + '%';
    
    const activityLevel = Math.min((stats.totalSolves || 0) / 100 * 100, 100);
    document.getElementById('activity-progress').style.width = activityLevel + '%';
}

function updateRecentActivity(activities) {
    const container = document.getElementById('recent-activity');
    
    if (activities.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No recent activity</p>';
        return;
    }
    
    container.innerHTML = activities.slice(0, 5).map(activity => `
        <div class="activity-item">
            <div class="fw-bold">${activity.title}</div>
            <div class="text-muted small">${activity.description}</div>
            <div class="text-muted small">${new Date(activity.timestamp).toLocaleDateString()}</div>
        </div>
    `).join('');
}

function uploadAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showAlert('Image size must be less than 5MB', 'warning');
                return;
            }
            
            const formData = new FormData();
            formData.append('avatar', file);
            
            fetch('/api/upload-avatar', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showAlert('Avatar updated successfully!', 'success');
                    // Update avatar display
                    document.getElementById('profile-avatar').style.backgroundImage = `url(${data.avatarUrl})`;
                } else {
                    throw new Error(data.message);
                }
            })
            .catch(error => {
                showAlert('Failed to upload avatar', 'danger');
            });
        }
    };
    input.click();
}

function downloadData() {
    // Download user's personal data
    fetch('/api/download-user-data', {
        method: 'POST'
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `profile-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showAlert('Profile data downloaded successfully', 'success');
    })
    .catch(error => {
        showAlert('Failed to download profile data', 'danger');
    });
}

// Initialize profile page
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/profile') {
        loadProfile();
    }
});
