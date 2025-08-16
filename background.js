// Custom visit tracking system
const visitSessions = {};
let visitData = {};  // Changed from const to let for proper reassignment
const activeVisits = {};

// Navigation state tracking
const tabNavigationState = {};
const tabUrls = {};

// Time tracking constants
const MIN_VISIT_DURATION = 1000; // Minimum 1 second to count as a visit
const IDLE_TIMEOUT = 30000; // 30 seconds of inactivity ends a visit

// Data persistence flag to prevent concurrent saves
let isSaving = false;
let saveQueue = false;

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated, loading data...');
  loadVisitData();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started, loading data...');
  loadVisitData();
});

// Load existing visit data from storage
async function loadVisitData() {
  try {
    const result = await chrome.storage.local.get(['customVisitData']);
    if (result.customVisitData && Object.keys(result.customVisitData).length > 0) {
      // Deep clone to avoid reference issues
      visitData = JSON.parse(JSON.stringify(result.customVisitData));
      console.log('Loaded visit data for', Object.keys(visitData).length, 'domains');
    } else {
      console.log('No existing visit data found, starting fresh');
      visitData = {};
    }
  } catch (error) {
    console.error('Error loading visit data:', error);
    // Don't reset visitData on error, keep what we have in memory
  }
}

// Save visit data to storage with queue mechanism
async function saveVisitData() {
  // If already saving, queue another save for after
  if (isSaving) {
    saveQueue = true;
    return;
  }

  isSaving = true;
  
  try {
    // Create a deep copy to avoid modification during save
    const dataToSave = JSON.parse(JSON.stringify(visitData));
    
    await chrome.storage.local.set({ customVisitData: dataToSave });
    console.log('Saved visit data for', Object.keys(dataToSave).length, 'domains');
    
    // Notify popup if open
    chrome.runtime.sendMessage({ 
      action: 'dataRefreshed',
      timestamp: Date.now()
    }).catch(() => {});
    
  } catch (error) {
    console.error('Error saving visit data:', error);
    // Keep data in memory even if save fails
  } finally {
    isSaving = false;
    
    // If there was a queued save, execute it now
    if (saveQueue) {
      saveQueue = false;
      setTimeout(() => saveVisitData(), 100);
    }
  }
}

// Get domain from URL
function getDomainFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

// Start a new visit session
function startVisit(tabId, url, timestamp = Date.now()) {
  const domain = getDomainFromUrl(url);
  if (!domain) return;

  // End any existing visit for this tab
  if (activeVisits[tabId]) {
    endVisit(tabId, timestamp);
  }

  // Initialize domain data if needed
  if (!visitData[domain]) {
    visitData[domain] = {
      totalVisits: 0,
      totalTime: 0,
      dailyVisits: {},
      dailyTime: {},
      lastVisit: 0,
      sessions: []
    };
  }

  // Create new visit session
  const session = {
    domain,
    startTime: timestamp,
    endTime: null,
    duration: 0,
    isActive: true
  };

  activeVisits[tabId] = session;
  
  // Increment visit count for today
  const today = new Date(timestamp).toDateString();
  if (!visitData[domain].dailyVisits[today]) {
    visitData[domain].dailyVisits[today] = 0;
    visitData[domain].dailyTime[today] = 0;
  }
  
  // Increment visit count (including current visit)
  visitData[domain].dailyVisits[today]++;
  visitData[domain].totalVisits++;
  visitData[domain].lastVisit = timestamp;
  
  // Save immediately to ensure current visit is counted
  saveVisitData();
  
  return session;
}

// End a visit session
function endVisit(tabId, timestamp = Date.now()) {
  const session = activeVisits[tabId];
  if (!session || !session.isActive) return;

  session.endTime = timestamp;
  session.duration = timestamp - session.startTime;
  session.isActive = false;

  // Only record time if visit was longer than minimum
  if (session.duration >= MIN_VISIT_DURATION) {
    const domain = session.domain;
    
    // Make sure domain data still exists
    if (!visitData[domain]) {
      visitData[domain] = {
        totalVisits: 0,
        totalTime: 0,
        dailyVisits: {},
        dailyTime: {},
        lastVisit: 0,
        sessions: []
      };
    }
    
    const today = new Date(session.startTime).toDateString();
    
    // Update time spent
    visitData[domain].totalTime += session.duration;
    visitData[domain].dailyTime[today] = (visitData[domain].dailyTime[today] || 0) + session.duration;
    
    // Store session details (keep only last 100 sessions per domain)
    if (!visitData[domain].sessions) {
      visitData[domain].sessions = [];
    }
    visitData[domain].sessions.push({
      start: session.startTime,
      end: session.endTime,
      duration: session.duration
    });
    
    // Keep only last 100 sessions
    if (visitData[domain].sessions.length > 100) {
      visitData[domain].sessions = visitData[domain].sessions.slice(-100);
    }
    
    saveVisitData();
  }

  delete activeVisits[tabId];
}

// Pause a visit (tab inactive but not closed)
function pauseVisit(tabId) {
  const session = activeVisits[tabId];
  if (session && session.isActive) {
    const now = Date.now();
    const duration = now - session.startTime;
    
    // Update time spent so far
    const domain = session.domain;
    
    // Make sure domain data exists
    if (visitData[domain]) {
      const today = new Date(session.startTime).toDateString();
      
      visitData[domain].totalTime += duration;
      visitData[domain].dailyTime[today] = (visitData[domain].dailyTime[today] || 0) + duration;
      
      // Mark as paused
      session.isActive = false;
      session.pausedAt = now;
      
      saveVisitData();
    }
  }
}

// Resume a paused visit
function resumeVisit(tabId) {
  const session = activeVisits[tabId];
  if (session && !session.isActive && session.pausedAt) {
    // Start a new timing segment
    session.startTime = Date.now();
    session.isActive = true;
    delete session.pausedAt;
  }
}

// Track tab navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track navigation start (URL change or loading)
  if (changeInfo.url) {
    const oldUrl = tabUrls[tabId];
    const newUrl = changeInfo.url;
    
    // Check if this is a real navigation (not just hash change or same page)
    if (oldUrl !== newUrl) {
      const oldDomain = getDomainFromUrl(oldUrl);
      const newDomain = getDomainFromUrl(newUrl);
      
      // Only start new visit if domain changed or this is initial navigation
      if (oldDomain !== newDomain || !oldDomain) {
        tabNavigationState[tabId] = {
          navigating: true,
          url: newUrl,
          startTime: Date.now()
        };
        tabUrls[tabId] = newUrl;
        
        // Start visit immediately on navigation
        startVisit(tabId, newUrl);
      }
    }
  }
  
  // Track navigation complete
  if (changeInfo.status === 'complete' && tab.url) {
    const navState = tabNavigationState[tabId];
    
    // Send popup notification if this was a real navigation
    if (navState && navState.navigating) {
      navState.navigating = false;
      
      const domain = getDomainFromUrl(tab.url);
      if (domain) {
        // Delay popup slightly to ensure page is ready
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            action: 'showVisitPopup',
            isNewVisit: true
          }).catch(() => {});
        }, 1000);
      }
    }
  }
});

// Track tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const { tabId, windowId } = activeInfo;
  
  // Pause all other visits in this window
  const tabs = await chrome.tabs.query({ windowId });
  tabs.forEach(tab => {
    if (tab.id !== tabId && activeVisits[tab.id]) {
      pauseVisit(tab.id);
    }
  });
  
  // Resume or start visit for activated tab
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      if (activeVisits[tabId]) {
        resumeVisit(tabId);
      } else {
        startVisit(tabId, tab.url);
      }
    }
  } catch (e) {
    console.error('Error getting tab:', e);
  }
});

// Track tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  endVisit(tabId);
  delete tabUrls[tabId];
  delete tabNavigationState[tabId];
});

// Track window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus, pause all active visits
    Object.keys(activeVisits).forEach(tabId => {
      pauseVisit(parseInt(tabId));
    });
  } else {
    // Window gained focus, resume active tab
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        if (activeVisits[tabId]) {
          resumeVisit(tabId);
        }
      }
    } catch (e) {
      console.error('Error handling window focus:', e);
    }
  }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentSiteData') {
    const domain = request.domain?.replace(/^www\./, '');
    
    if (domain && visitData[domain]) {
      const today = new Date().toDateString();
      const todayVisits = visitData[domain].dailyVisits[today] || 0;
      const todayTime = visitData[domain].dailyTime[today] || 0;
      
      // Check if there's an active visit for this domain
      const activeTabVisit = Object.values(activeVisits).find(v => v.domain === domain && v.isActive);
      let currentSessionTime = 0;
      
      if (activeTabVisit) {
        currentSessionTime = Date.now() - activeTabVisit.startTime;
      }
      
      sendResponse({
        success: true,
        data: {
          todayVisits: todayVisits,
          totalVisits: visitData[domain].totalVisits,
          todayTime: todayTime + currentSessionTime,
          totalTime: visitData[domain].totalTime + currentSessionTime,
          lastVisit: visitData[domain].lastVisit,
          isCurrentlyActive: !!activeTabVisit
        }
      });
    } else {
      sendResponse({
        success: true,
        data: {
          todayVisits: 0,
          totalVisits: 0,
          todayTime: 0,
          totalTime: 0,
          lastVisit: null,
          isCurrentlyActive: false
        }
      });
    }
    return true;
  }
  
  if (request.action === 'getVisitData') {
    // Return visit data for popup - make sure we have the latest
    sendResponse({
      success: true,
      data: visitData || {},
      lastRefresh: Date.now()
    });
    return true;
  }
  
  if (request.action === 'refreshData') {
    // Save current state
    saveVisitData().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'clearAllData') {
    // Clear all custom visit data - user explicitly requested this
    visitData = {};  // Reset to empty object, not delete properties
    Object.keys(activeVisits).forEach(key => delete activeVisits[key]);
    
    chrome.storage.local.remove(['customVisitData']).then(() => {
      console.log('User cleared all data');
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'settingsUpdated') {
    sendResponse({ success: true });
    return true;
  }
});

// Periodic cleanup of old data (keep only last 90 days)
// Run less frequently to avoid issues
setInterval(() => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  let cleaned = false;
  
  Object.keys(visitData).forEach(domain => {
    const siteData = visitData[domain];
    if (!siteData) return;
    
    // Clean up old daily data
    Object.keys(siteData.dailyVisits || {}).forEach(dateKey => {
      if (new Date(dateKey) < cutoffDate) {
        delete siteData.dailyVisits[dateKey];
        if (siteData.dailyTime) {
          delete siteData.dailyTime[dateKey];
        }
        cleaned = true;
      }
    });
    
    // Clean up old sessions
    if (siteData.sessions && Array.isArray(siteData.sessions)) {
      const oldLength = siteData.sessions.length;
      siteData.sessions = siteData.sessions.filter(s => s.start > cutoffDate.getTime());
      if (oldLength !== siteData.sessions.length) {
        cleaned = true;
      }
    }
  });
  
  // Only save if we actually cleaned something
  if (cleaned) {
    console.log('Cleaned old data older than 90 days');
    saveVisitData();
  }
}, 3600000); // Run every hour

// Periodic save to ensure data persistence (every 5 minutes)
setInterval(() => {
  // Only save if there's active data
  if (Object.keys(visitData).length > 0) {
    console.log('Periodic save of visit data');
    saveVisitData();
  }
}, 300000); // Every 5 minutes

// Save data when extension might be unloading
chrome.runtime.onSuspend?.addListener(() => {
  console.log('Extension suspending, saving data...');
  // Force synchronous-ish save before suspend
  const dataToSave = JSON.parse(JSON.stringify(visitData));
  chrome.storage.local.set({ customVisitData: dataToSave });
});