(function() {
  // Check if we should run on this page
  if (window.location.protocol === 'chrome:' || 
      window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'about:' ||
      window.location.protocol === 'file:' ||
      window.location.protocol === 'view-source:') {
    return;
  }

  let popupElement = null;
  let hideTimeout = null;
  let updateInterval = null;
  let currentDomain = window.location.hostname.replace(/^www\./, '');
  let currentVisitData = null;
  
  // Timer constants
  const POPUP_COOLDOWN_SECONDS = 300; // 5 minutes
  const DOMAIN_TIMESTAMP_KEY = 'siteTrackerDomainTimestamps';

  // Format time duration
  function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  function createPopup(data) {
    if (popupElement) {
      clearTimeout(hideTimeout);
      updatePopup(data);
      return;
    }
    
    currentVisitData = data;
    
    popupElement = document.createElement('div');
    popupElement.id = 'site-tracker-popup';
    
    // Updated popup HTML to include current visit and time tracking
    const timeSpent = data.todayTime ? formatDuration(data.todayTime) : '0s';
    const totalTimeSpent = data.totalTime ? formatDuration(data.totalTime) : '0s';
    
    popupElement.innerHTML = `
      <div class="st-popup-content">
        <div class="st-popup-header">
          <span class="st-popup-title">Visit Tracker</span>
          <button class="st-popup-close" aria-label="Close">×</button>
        </div>
        <div class="st-popup-body">
          <div class="st-visit-count">${data.todayVisits}</div>
          <div class="st-visit-label">visits today (including current)</div>
          <div class="st-time-spent">Time today: <span id="st-time-today">${timeSpent}</span></div>
          <div class="st-total-count">
            Total visits: ${data.totalVisits}<br>
            Total time: <span id="st-time-total">${totalTimeSpent}</span>
          </div>
        </div>
      </div>
    `;
    
    // Add custom styles for the new elements
    const style = document.createElement('style');
    style.textContent = `
      .st-time-spent {
        font-size: 12px;
        color: #0f766e;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #a7f3d0;
        font-weight: 500;
      }
      
      #st-time-today, #st-time-total {
        font-weight: 600;
        color: #14b8a6;
      }
      
      .st-popup-body {
        padding: 14px 12px;
        text-align: center;
        min-height: 120px;
      }
      
      .st-visit-label {
        font-size: 11px;
        color: #14b8a6;
        margin-bottom: 4px;
      }
    `;
    
    if (!document.head.querySelector('#st-custom-styles')) {
      style.id = 'st-custom-styles';
      document.head.appendChild(style);
    }
    
    document.body.appendChild(popupElement);
    
    popupElement.querySelector('.st-popup-close').addEventListener('click', () => {
      hidePopup();
    });
    
    setTimeout(() => {
      popupElement.classList.add('st-popup-visible');
    }, 100);
    
    // Start live time update if visit is active
    if (data.isCurrentlyActive) {
      startTimeUpdate();
    }
    
    // Auto-hide after 8 seconds
    hideTimeout = setTimeout(() => {
      hidePopup();
    }, 8000);
  }

  function updatePopup(data) {
    if (!popupElement) return;
    
    currentVisitData = data;
    
    const timeSpent = data.todayTime ? formatDuration(data.todayTime) : '0s';
    const totalTimeSpent = data.totalTime ? formatDuration(data.totalTime) : '0s';
    
    popupElement.querySelector('.st-visit-count').textContent = data.todayVisits;
    popupElement.querySelector('.st-visit-label').textContent = 'visits today (including current)';
    popupElement.querySelector('#st-time-today').textContent = timeSpent;
    popupElement.querySelector('#st-time-total').textContent = totalTimeSpent;
    popupElement.querySelector('.st-total-count').innerHTML = `
      Total visits: ${data.totalVisits}<br>
      Total time: <span id="st-time-total">${totalTimeSpent}</span>
    `;
    
    popupElement.classList.add('st-popup-visible');
    
    // Restart live time update if needed
    if (data.isCurrentlyActive) {
      startTimeUpdate();
    } else {
      stopTimeUpdate();
    }
    
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      hidePopup();
    }, 8000);
  }

  function startTimeUpdate() {
    // Stop any existing interval
    stopTimeUpdate();
    
    // Update time every second
    updateInterval = setInterval(() => {
      if (currentVisitData && popupElement) {
        // Request updated data from background
        chrome.runtime.sendMessage({
          action: 'getCurrentSiteData',
          domain: currentDomain
        }, (response) => {
          if (response && response.success && response.data) {
            const timeSpent = response.data.todayTime ? formatDuration(response.data.todayTime) : '0s';
            const totalTimeSpent = response.data.totalTime ? formatDuration(response.data.totalTime) : '0s';
            
            const todayElement = popupElement.querySelector('#st-time-today');
            const totalElement = popupElement.querySelector('#st-time-total');
            
            if (todayElement) todayElement.textContent = timeSpent;
            if (totalElement) totalElement.textContent = totalTimeSpent;
          }
        });
      }
    }, 1000);
  }

  function stopTimeUpdate() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  function hidePopup() {
    if (!popupElement) return;
    
    stopTimeUpdate();
    popupElement.classList.remove('st-popup-visible');
    
    setTimeout(() => {
      if (popupElement && popupElement.parentElement) {
        popupElement.parentElement.removeChild(popupElement);
      }
      popupElement = null;
      currentVisitData = null;
    }, 300);
  }

  async function canShowPopupForDomain(domain) {
    return new Promise((resolve) => {
      chrome.storage.local.get([DOMAIN_TIMESTAMP_KEY], (result) => {
        const timestamps = result[DOMAIN_TIMESTAMP_KEY] || {};
        const now = Date.now();
        const lastShown = timestamps[domain] || 0;
        const timeDiff = (now - lastShown) / 1000; // Convert to seconds
        
        resolve(timeDiff >= POPUP_COOLDOWN_SECONDS);
      });
    });
  }

  async function updateDomainTimestamp(domain) {
    return new Promise((resolve) => {
      chrome.storage.local.get([DOMAIN_TIMESTAMP_KEY], (result) => {
        const timestamps = result[DOMAIN_TIMESTAMP_KEY] || {};
        const now = Date.now();
        timestamps[domain] = now;
        
        // Cleanup old timestamps (older than 24 hours)
        const cutoffTime = now - (24 * 60 * 60 * 1000);
        Object.keys(timestamps).forEach(key => {
          if (timestamps[key] < cutoffTime) {
            delete timestamps[key];
          }
        });
        
        chrome.storage.local.set({ [DOMAIN_TIMESTAMP_KEY]: timestamps }, () => {
          resolve();
        });
      });
    });
  }

  async function showVisitPopup(forceShow = false, isNewVisit = false) {
    // For new visits (actual navigation), always show popup
    // For other cases, check cooldown timer
    if (!isNewVisit && !forceShow) {
      const canShow = await canShowPopupForDomain(currentDomain);
      if (!canShow) {
        return;
      }
    }
    
    // Check if notifications are enabled
    chrome.storage.local.get(['settings'], async (result) => {
      const settings = result.settings || { showNotifications: true };
      
      if (!settings.showNotifications) {
        return;
      }
      
      chrome.runtime.sendMessage({
        action: 'getCurrentSiteData',
        domain: currentDomain
      }, async (response) => {
        if (response && response.success && response.data) {
          // Always show popup if there's data (current visit is already included)
          if (response.data.todayVisits > 0 || response.data.totalVisits > 0) {
            // Update timestamp to prevent showing again for cooldown period
            await updateDomainTimestamp(currentDomain);
            createPopup(response.data);
          }
        }
      });
    });
  }

  // Handle messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showVisitPopup') {
      // This is triggered from background.js on actual navigation
      showVisitPopup(false, request.isNewVisit || false);
    }
  });

  // Handle page visibility changes for accurate time tracking
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Page is hidden, stop time updates
      stopTimeUpdate();
    } else {
      // Page is visible again, restart time updates if popup is visible
      if (popupElement && currentVisitData && currentVisitData.isCurrentlyActive) {
        startTimeUpdate();
      }
    }
  });

  // Only show popup on initial page load for returning visits
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Don't auto-show on page load - wait for navigation event from background
      // This prevents popup spam on SPAs and AJAX-heavy sites
    });
  }
})();