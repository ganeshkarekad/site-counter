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
  let lastDomain = sessionStorage.getItem('siteTrackerLastDomain');
  let currentDomain = window.location.hostname.replace(/^www\./, '');

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

  function showVisitPopup(forceShow = false) {
    // Don't show popup if we're on the same domain (unless forced)
    if (!forceShow && lastDomain === currentDomain) {
      return;
    }
    
    // Check if notifications are enabled
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || { showNotifications: true };
      
      if (!settings.showNotifications) {
        // Update domain tracking even if not showing popup
        sessionStorage.setItem('siteTrackerLastDomain', currentDomain);
        return;
      }
      
      // Update the last domain
      sessionStorage.setItem('siteTrackerLastDomain', currentDomain);
      
      chrome.runtime.sendMessage({
        action: 'getCurrentSiteData',
        domain: currentDomain
      }, response => {
        if (response && response.success && response.data) {
          if (response.data.todayVisits > 0 || response.data.totalVisits > 0) {
            createPopup(response.data);
          }
        }
      });
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showVisitPopup') {
      // This is triggered from background.js on tab update, check if it's a new domain
      setTimeout(() => {
        showVisitPopup(true); // Force show when triggered by tab update
      }, 1000);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Don't show on visibility change if same domain
      showVisitPopup(false);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => showVisitPopup(false), 1000);
    });
  } else {
    setTimeout(() => showVisitPopup(false), 1000);
  }
})();