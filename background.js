let refreshInterval;
let lastRefreshTime = 0;

chrome.runtime.onInstalled.addListener(() => {
  console.log('Site Tracker extension installed');
  refreshVisitData();
  startAutoRefresh();
});

chrome.runtime.onStartup.addListener(() => {
  refreshVisitData();
  startAutoRefresh();
});

function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(() => {
    refreshVisitData();
  }, 60000);
}

async function refreshVisitData() {
  const startTime = Date.now();
  
  if (startTime - lastRefreshTime < 5000) {
    console.log('Rate limiting: too frequent refresh attempts');
    return;
  }
  
  lastRefreshTime = startTime;
  
  try {
    const endTime = Date.now();
    const oneYearAgo = endTime - (365 * 24 * 60 * 60 * 1000);
    
    const historyItems = await chrome.history.search({
      text: '',
      startTime: oneYearAgo,
      endTime: endTime,
      maxResults: 100000
    });
    
    const visitData = {};
    
    for (const item of historyItems) {
      if (!item.url || !item.visitCount) continue;
      
      try {
        const url = new URL(item.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
        
        const domain = url.hostname.replace(/^www\./, '');
        
        if (!visitData[domain]) {
          visitData[domain] = {
            count: 0,
            lastVisit: 0,
            dailyVisits: {}
          };
        }
        
        const visits = await chrome.history.getVisits({ url: item.url });
        
        for (const visit of visits) {
          if (visit.visitTime >= oneYearAgo) {
            const dateKey = new Date(visit.visitTime).toDateString();
            
            visitData[domain].count++;
            visitData[domain].lastVisit = Math.max(visitData[domain].lastVisit, visit.visitTime);
            
            if (!visitData[domain].dailyVisits[dateKey]) {
              visitData[domain].dailyVisits[dateKey] = 0;
            }
            visitData[domain].dailyVisits[dateKey]++;
          }
        }
      } catch (e) {
        console.error('Error processing URL:', item.url, e);
      }
    }
    
    await chrome.storage.local.set({
      visitData: visitData,
      lastRefresh: Date.now()
    });
    
    chrome.runtime.sendMessage({ 
      action: 'dataRefreshed',
      timestamp: Date.now()
    }).catch(() => {});
    
    console.log('Visit data refreshed successfully');
  } catch (error) {
    console.error('Error refreshing visit data:', error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'settingsUpdated') {
    // Settings were updated in popup, no need to do anything special here
    // The content script will check settings when showing popups
    console.log('Settings updated:', request.settings);
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'refreshData') {
    refreshVisitData().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.action === 'getCurrentSiteData') {
    chrome.storage.local.get(['visitData']).then(result => {
      const visitData = result.visitData || {};
      let domain = request.domain;
      
      if (domain) {
        domain = domain.replace(/^www\./, '');
        const siteData = visitData[domain];
        
        if (siteData) {
          const today = new Date().toDateString();
          const todayVisits = siteData.dailyVisits[today] || 0;
          
          sendResponse({
            success: true,
            data: {
              todayVisits: todayVisits,
              totalVisits: siteData.count,
              lastVisit: siteData.lastVisit
            }
          });
        } else {
          sendResponse({
            success: true,
            data: {
              todayVisits: 0,
              totalVisits: 0,
              lastVisit: null
            }
          });
        }
      } else {
        sendResponse({ success: false, error: 'No domain provided' });
      }
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.action === 'getVisitData') {
    chrome.storage.local.get(['visitData', 'lastRefresh']).then(result => {
      sendResponse({
        success: true,
        data: result.visitData || {},
        lastRefresh: result.lastRefresh || null
      });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.action === 'clearAllData') {
    chrome.storage.local.clear().then(() => {
      sendResponse({ success: true });
      refreshVisitData();
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Track the last URL for each tab to detect actual navigation
const tabUrls = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only proceed if the URL has changed and the page is complete
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      
      // Check if this is an actual navigation (URL changed)
      const lastUrl = tabUrls[tabId];
      if (lastUrl === tab.url) {
        // Same URL, likely an XHR request or refresh, don't show popup
        return;
      }
      
      // Update the stored URL for this tab
      tabUrls[tabId] = tab.url;
      
      // Only show popup for http/https pages
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        chrome.tabs.sendMessage(tabId, {
          action: 'showVisitPopup'
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Invalid URL:', tab.url);
    }
  }
});

// Clean up stored URLs when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabUrls[tabId];
});