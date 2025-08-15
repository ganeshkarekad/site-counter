(function() {
  // Check if we should run on this page
  if (window.location.protocol === 'chrome:' || 
      window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'about:' ||
      window.location.protocol === 'file:' ||
      window.location.protocol === 'view-source:') {
    // Don't run on these pages
    return;
  }

  let popupElement = null;
  let hideTimeout = null;
  let currentDomain = window.location.hostname.replace(/^www\./, '');
  
  // Timer constants
  const POPUP_COOLDOWN_SECONDS = 300; // 5 minutes
  const DOMAIN_TIMESTAMP_KEY = 'siteTrackerDomainTimestamps';

  function createPopup(data) {
    if (popupElement) {
      clearTimeout(hideTimeout);
      updatePopup(data);
      return;
    }
    
    popupElement = document.createElement('div');
    popupElement.id = 'site-tracker-popup';
    popupElement.innerHTML = `
      <div class="st-popup-content">
        <div class="st-popup-header">
          <span class="st-popup-title">Today's Visits</span>
          <button class="st-popup-close" aria-label="Close">×</button>
        </div>
        <div class="st-popup-body">
          <div class="st-visit-count">${data.todayVisits}</div>
          <div class="st-visit-label">visits to this site today</div>
          <div class="st-total-count">Total: ${data.totalVisits} visits</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(popupElement);
    
    popupElement.querySelector('.st-popup-close').addEventListener('click', () => {
      hidePopup();
    });
    
    setTimeout(() => {
      popupElement.classList.add('st-popup-visible');
    }, 100);
    
    hideTimeout = setTimeout(() => {
      hidePopup();
    }, 5000);
  }

  function updatePopup(data) {
    if (!popupElement) return;
    
    popupElement.querySelector('.st-visit-count').textContent = data.todayVisits;
    popupElement.querySelector('.st-total-count').textContent = `Total: ${data.totalVisits} visits`;
    
    popupElement.classList.add('st-popup-visible');
    
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      hidePopup();
    }, 5000);
  }

  function hidePopup() {
    if (!popupElement) return;
    
    popupElement.classList.remove('st-popup-visible');
    
    setTimeout(() => {
      if (popupElement && popupElement.parentElement) {
        popupElement.parentElement.removeChild(popupElement);
      }
      popupElement = null;
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

  async function showVisitPopup(forceShow = false) {
    // Check if we can show popup for this domain (timer-based check)
    const canShow = await canShowPopupForDomain(currentDomain);
    if (!forceShow && !canShow) {
      return;
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
          if (response.data.todayVisits > 0 || response.data.totalVisits > 0) {
            // Update timestamp to prevent showing again for 300 seconds
            await updateDomainTimestamp(currentDomain);
            createPopup(response.data);
          }
        }
      });
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showVisitPopup') {
      // This is triggered from background.js on actual navigation
      showVisitPopup(false); // Use timer-based logic, don't force
    }
  });

  // Only show popup on initial page load, not on visibility changes
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => showVisitPopup(false), 1500);
    });
  } else {
    setTimeout(() => showVisitPopup(false), 1500);
  }
})();