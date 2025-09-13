console.log('Content script loaded on:', window.location.href);

// Request today's visit count from background script
let dailyVisitPopup = null;
let popupEnabled = true;
let quotaEnabled = true;
let hardBlockEnabled = false;

// Cache quotas locally for quick checks
let siteQuotasCache = {};

// Load settings and schedule UI
chrome.storage.local.get(['popupEnabled', 'quotaEnabled', 'hardBlockEnabled', 'siteQuotas'], (result) => {
  popupEnabled = result.popupEnabled !== false; // Default to true if not set
  quotaEnabled = result.quotaEnabled !== false; // Default to true if not set
  hardBlockEnabled = result.hardBlockEnabled === true; // Default to false if not set
  siteQuotasCache = result.siteQuotas || {};

  if (popupEnabled) {
    // Show visit count when page loads (with delay to ensure page is ready)
    setTimeout(() => {
      showDailyVisitCount();
    }, 1500);
  }

  if (quotaEnabled) {
    // Check quota shortly after load as well
    setTimeout(() => {
      checkQuotaForCurrentDomain();
    }, 1800);
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

        // Also check quota and show a soft-block message if exceeded
        maybeShowQuotaMessage(currentDomain, visitCount);
      }
    }
  );
}

function checkQuotaForCurrentDomain() {
  if (!quotaEnabled) return;
  const currentDomain = window.location.hostname;
  chrome.runtime.sendMessage(
    { action: 'getDomains', period: 'today' },
    (response) => {
      if (response && response.success) {
        const d = response.domains.find(domain => domain.domain === currentDomain);
        const visitCount = d ? d.visitCount : 0;
        maybeShowQuotaMessage(currentDomain, visitCount);
        maybeHardBlock(currentDomain, visitCount);
      }
    }
  );
}

function maybeShowQuotaMessage(domain, visitCount) {
  try {
    const maxPerDay = parseInt(siteQuotasCache[domain], 10) || 0;
    if (!quotaEnabled || !maxPerDay || maxPerDay <= 0) return;
    if (visitCount > maxPerDay) {
      showQuotaExceededMessage(`Daily limit exceeded for ${domain}. (${visitCount}/${maxPerDay})`);
    }
  } catch (e) {
    // ignore
  }
}

function maybeHardBlock(domain, visitCount) {
  try {
    const maxPerDay = parseInt(siteQuotasCache[domain], 10) || 0;
    if (!quotaEnabled || !hardBlockEnabled || !maxPerDay || maxPerDay <= 0) return;
    if (visitCount > maxPerDay) {
      showHardBlockOverlay(domain, visitCount, maxPerDay);
    }
  } catch (e) {
    // ignore
  }
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
    displayInfoMessage(request.message);
    sendResponse({ success: true });
  }

  if (request.action === 'quotaExceeded') {
    showQuotaExceededMessage(request.message || 'Daily limit exceeded for this site.');
    sendResponse({ success: true });
  }

  if (request.action === 'hardBlock') {
    const { domain, todayCount, maxPerDay } = request;
    showHardBlockOverlay(domain || window.location.hostname, todayCount, maxPerDay);
    sendResponse({ success: true });
  }
  
  return true;
});

function displayInfoMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.textContent = text;
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
}

function showQuotaExceededMessage(text) {
  // Avoid duplicate notifications on the same page instance
  if (window.__foculaticsQuotaShown) return;
  window.__foculaticsQuotaShown = true;
  displayThreatMessage(text);
}

function getExtensionIconUrl() {
  try {
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL('icons/icon32.png');
    }
  } catch (e) {}
  return null;
}

function displayThreatMessage(text) {
  const wrapper = document.createElement('div');
  const iconUrl = getExtensionIconUrl();
  wrapper.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #dc3545 0%, #b02a37 100%);
    color: white;
    padding: 14px 18px;
    border-radius: 10px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 12px 40px rgba(220, 53, 69, 0.35), 0 4px 16px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(8px);
    animation: slideIn 0.25s ease-out;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  if (iconUrl) {
    const img = document.createElement('img');
    img.src = iconUrl;
    img.alt = 'Foculatics';
    img.width = 20;
    img.height = 20;
    img.style.cssText = `
      display: block;
      width: 20px;
      height: 20px;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
      border-radius: 4px;
    `;
    content.appendChild(img);
  }

  const textEl = document.createElement('div');
  textEl.textContent = text;
  textEl.style.cssText = `
    line-height: 1.2;
    letter-spacing: 0.2px;
  `;
  content.appendChild(textEl);

  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  setTimeout(() => {
    wrapper.style.animation = 'slideIn 0.25s ease-out reverse';
    setTimeout(() => {
      wrapper.remove();
    }, 250);
  }, 3500);
}

function showHardBlockOverlay(domain, visits, max) {
  // Prevent duplicates
  if (window.__foculaticsHardBlocked) return;
  window.__foculaticsHardBlocked = true;

  const overlay = document.createElement('div');
  overlay.id = 'foculatics-hard-block-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: radial-gradient(circle at 50% 20%, rgba(220,53,69,0.35), rgba(176,42,55,0.85)),
                linear-gradient(180deg, #7a1d27 0%, #3b0a0f 100%);
    color: #fff;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    backdrop-filter: blur(6px);
    cursor: not-allowed;
  `;

  // Lock page scroll while overlay is active
  const prevHtmlOverflow = document.documentElement.style.overflow;
  const prevBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const container = document.createElement('div');
  container.style.cssText = `
    max-width: 680px;
    padding: 28px 28px 32px;
    border-radius: 20px;
    background: rgba(176, 42, 55, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 30px 120px rgba(0,0,0,0.65), 0 16px 48px rgba(176,42,55,0.4);
  `;

  const iconRow = document.createElement('div');
  iconRow.style.cssText = 'display:flex; justify-content:center; margin-bottom: 14px; gap:12px; align-items:center;';
  const iconUrl = getExtensionIconUrl();
  if (iconUrl) {
    const img = document.createElement('img');
    img.src = iconUrl;
    img.alt = 'Foculatics';
    img.width = 36;
    img.height = 36;
    img.style.cssText = 'border-radius:8px; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));';
    iconRow.appendChild(img);
  }
  const warning = document.createElement('span');
  warning.textContent = 'ACCESS BLOCKED';
  warning.style.cssText = 'font-weight:800; letter-spacing:2px; color:#fff; background: rgba(255,255,255,0.08); padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.12);';
  iconRow.appendChild(warning);

  const title = document.createElement('div');
  title.textContent = `Daily limit exceeded for ${domain}`;
  title.style.cssText = 'font-size: 28px; font-weight: 900; margin: 6px 0 10px; text-shadow: 0 3px 6px rgba(0,0,0,0.4);';

  const sub = document.createElement('div');
  sub.textContent = `Usage blocked for today (${visits}/${max}).`;
  sub.style.cssText = 'opacity: 0.92; margin-bottom: 14px; font-weight: 600;';

  const hint = document.createElement('div');
  hint.innerHTML = `You can turn off Hard Block or Daily Site Limits in the extension settings.`;
  hint.style.cssText = 'opacity: 0.85; font-size: 13px; margin-top: 6px;';

  container.appendChild(iconRow);
  container.appendChild(title);
  container.appendChild(sub);
  container.appendChild(hint);
  overlay.appendChild(container);

  document.body.appendChild(overlay);

  // Do not provide a dismiss button – this is a hard block.
  // If settings are changed, a reload will remove the overlay.

  // Defensive: If DOM is replaced, try to keep overlay at top
  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }
  });
  observer.observe(document.body, { childList: true });

  // Track navigation changes to release locks when page truly unloads
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
  });
}
