/* ========================================
   Settings Page JavaScript
   ======================================== */

let hasUnsavedChanges = false;

function markChanged() {
    hasUnsavedChanges = true;
    const indicator = document.getElementById('save-indicator');
    if (indicator) {
        indicator.style.display = 'block';
    }
}

async function saveAllSettings() {
    const settings = {
        botSettings: {
            username: document.getElementById('bot-username').value,
            password: document.getElementById('bot-password').value,
            prefix: document.getElementById('command-prefix').value,
            autoRole: document.getElementById('auto-role').checked,
            autoArchive: document.getElementById('auto-archive').checked,
            sessionLimit: document.getElementById('session-limit').value
        },
        notifications: {
            emailAlerts: document.getElementById('email-alerts').checked,
            discordNotifications: document.getElementById('discord-notifications').checked,
            webhookUrl: document.getElementById('webhook-url').value,
            alertThreshold: document.getElementById('alert-threshold').value
        },
        security: {
            sessionTimeout: document.getElementById('session-timeout').value,
            maxLoginAttempts: document.getElementById('max-login-attempts').value,
            requireStrongPassword: document.getElementById('require-strong-password').checked,
            twoFactorAuth: document.getElementById('two-factor-auth').checked
        },
        ctfSettings: {
            defaultPlatform: document.getElementById('default-platform').value,
            autoInit: document.getElementById('auto-init').checked,
            archiveOldEvents: document.getElementById('archive-old-events').checked,
            deleteAfterDays: document.getElementById('delete-after-days').value
        }
    };
    
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            showAlert('Settings saved successfully!', 'success');
            hasUnsavedChanges = false;
            const indicator = document.getElementById('save-indicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
        } else {
            throw new Error('Failed to save settings');
        }
    } catch (error) {
        showAlert('Failed to save settings', 'danger');
    }
}

async function resetSettings(section) {
    if (confirm(`Are you sure you want to reset ${section} settings to defaults?`)) {
        try {
            const response = await fetch(`/api/settings/${section}/reset`, {
                method: 'POST'
            });
            
            if (response.ok) {
                showAlert(`${section} settings reset successfully`, 'success');
                loadSettings();
            } else {
                throw new Error('Failed to reset settings');
            }
        } catch (error) {
            showAlert(`Failed to reset ${section} settings`, 'danger');
        }
    }
}

async function testConnection() {
    const webhookUrl = document.getElementById('webhook-url').value;
    if (!webhookUrl) {
        showAlert('Please enter a webhook URL first', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/test-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ webhookUrl })
        });
        
        if (response.ok) {
            showAlert('Webhook connection successful!', 'success');
        } else {
            throw new Error('Webhook test failed');
        }
    } catch (error) {
        showAlert('Webhook connection failed', 'danger');
    }
}

function exportSettings() {
    // Export current settings as JSON
    const settings = {
        exportDate: new Date().toISOString(),
        botSettings: {
            prefix: document.getElementById('command-prefix').value,
            autoRole: document.getElementById('auto-role').checked,
            autoArchive: document.getElementById('auto-archive').checked,
            sessionLimit: document.getElementById('session-limit').value
        },
        notifications: {
            emailAlerts: document.getElementById('email-alerts').checked,
            discordNotifications: document.getElementById('discord-notifications').checked,
            alertThreshold: document.getElementById('alert-threshold').value
        },
        security: {
            sessionTimeout: document.getElementById('session-timeout').value,
            maxLoginAttempts: document.getElementById('max-login-attempts').value,
            requireStrongPassword: document.getElementById('require-strong-password').checked,
            twoFactorAuth: document.getElementById('two-factor-auth').checked
        },
        ctfSettings: {
            defaultPlatform: document.getElementById('default-platform').value,
            autoInit: document.getElementById('auto-init').checked,
            archiveOldEvents: document.getElementById('archive-old-events').checked,
            deleteAfterDays: document.getElementById('delete-after-days').value
        }
    };
    
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ctf-assistant-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const settings = JSON.parse(e.target.result);
                    applyImportedSettings(settings);
                    showAlert('Settings imported successfully!', 'success');
                } catch (error) {
                    showAlert('Failed to import settings. Invalid file format.', 'danger');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

function applyImportedSettings(settings) {
    if (settings.botSettings) {
        setElementValue('command-prefix', settings.botSettings.prefix || '');
        setElementChecked('auto-role', settings.botSettings.autoRole || false);
        setElementChecked('auto-archive', settings.botSettings.autoArchive || false);
        setElementValue('session-limit', settings.botSettings.sessionLimit || '');
    }
    
    if (settings.notifications) {
        setElementChecked('email-alerts', settings.notifications.emailAlerts || false);
        setElementChecked('discord-notifications', settings.notifications.discordNotifications || false);
        setElementValue('alert-threshold', settings.notifications.alertThreshold || '');
    }
    
    if (settings.security) {
        setElementValue('session-timeout', settings.security.sessionTimeout || '');
        setElementValue('max-login-attempts', settings.security.maxLoginAttempts || '');
        setElementChecked('require-strong-password', settings.security.requireStrongPassword || false);
        setElementChecked('two-factor-auth', settings.security.twoFactorAuth || false);
    }
    
    if (settings.ctfSettings) {
        setElementValue('default-platform', settings.ctfSettings.defaultPlatform || 'ctfd');
        setElementChecked('auto-init', settings.ctfSettings.autoInit || false);
        setElementChecked('archive-old-events', settings.ctfSettings.archiveOldEvents || false);
        setElementValue('delete-after-days', settings.ctfSettings.deleteAfterDays || '');
    }
    
    markChanged();
}

function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

function setElementChecked(id, checked) {
    const element = document.getElementById(id);
    if (element && element.type === 'checkbox') {
        element.checked = checked;
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        applyImportedSettings(settings);
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Initialize settings page
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/settings') {
        loadSettings();
        
        // Add change listeners to all form elements
        const formElements = document.querySelectorAll('input, select, textarea');
        formElements.forEach(element => {
            element.addEventListener('change', markChanged);
        });
        
        // Warn about unsaved changes
        window.addEventListener('beforeunload', function(e) {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
});
