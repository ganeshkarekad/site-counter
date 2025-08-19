console.log('Content script loaded on:', window.location.href);

// Request today's visit count from background script
let dailyVisitPopup = null;
let popupEnabled = true;

// Check if popup is enabled in settings
chrome.storage.local.get(['popupEnabled'], (result) => {
  popupEnabled = result.popupEnabled !== false; // Default to true if not set
  if (popupEnabled) {
    // Show visit count when page loads (with delay to ensure page is ready)
    setTimeout(() => {
      showDailyVisitCount();
    }, 1500);
  }
});

function showDailyVisitCount() {
  if (!popupEnabled) return;
  
  const currentDomain = window.location.hostname;
  
  chrome.runtime.sendMessage(
    { action: 'getDomains', period: 'today' },
    (response) => {
      if (response && response.success) {
        const currentDomainData = response.domains.find(domain => domain.domain === currentDomain);
        const visitCount = currentDomainData ? currentDomainData.visitCount : 0;
        displayVisitPopup(visitCount, currentDomain);
      }
    }
  );
}

function displayVisitPopup(visitCount, domain) {
  // Remove existing popup if any
  if (dailyVisitPopup) {
    dailyVisitPopup.remove();
  }

  // Create popup element
  dailyVisitPopup = document.createElement('div');
  dailyVisitPopup.id = 'foculatics-daily-visits';
  dailyVisitPopup.innerHTML = `
    <div style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, #20c997 0%, #17a2b8 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 12px 40px rgba(32, 201, 151, 0.25), 0 4px 16px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      max-width: 280px;
      opacity: 0;
      transform: translateY(20px) scale(0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      text-align: center;
    " onmouseover="this.style.transform='translateY(-6px) scale(1.02)'; this.style.boxShadow='0 16px 50px rgba(32, 201, 151, 0.35), 0 8px 24px rgba(0, 0, 0, 0.15)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 12px 40px rgba(32, 201, 151, 0.25), 0 4px 16px rgba(0, 0, 0, 0.1)'">
      <div style="
        font-size: 28px; 
        font-weight: 800;
        margin-bottom: 6px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        letter-spacing: -0.5px;
        text-align: center;
      ">${visitCount}</div>
      <div style="
        font-size: 13px; 
        opacity: 0.95;
        line-height: 1.2;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: center;
      ">visits today</div>
    </div>
  `;

  // Add click handler to hide popup
  dailyVisitPopup.addEventListener('click', () => {
    hideDailyVisitPopup();
  });

  document.body.appendChild(dailyVisitPopup);

  // Animate in
  setTimeout(() => {
    const popup = dailyVisitPopup.querySelector('div');
    popup.style.opacity = '1';
    popup.style.transform = 'translateY(0) scale(1)';
  }, 100);

  // Auto-hide after 5 seconds
  setTimeout(() => {
    hideDailyVisitPopup();
  }, 5000);
}

function hideDailyVisitPopup() {
  if (dailyVisitPopup) {
    const popup = dailyVisitPopup.querySelector('div');
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(20px) scale(0.9)';
    
    setTimeout(() => {
      if (dailyVisitPopup && dailyVisitPopup.parentNode) {
        dailyVisitPopup.remove();
        dailyVisitPopup = null;
      }
    }, 400);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'togglePopup') {
    popupEnabled = request.enabled;
    if (!popupEnabled) {
      // Hide popup immediately if it's currently showing
      hideDailyVisitPopup();
    }
    sendResponse({ success: true });
  }
  
  if (request.action === 'showMessage') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = request.message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      padding: 15px 20px;
      border-radius: 5px;
      z-index: 999999;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      messageDiv.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        messageDiv.remove();
        style.remove();
      }, 300);
    }, 3000);
    
    sendResponse({ success: true });
  }
  
  return true;
});