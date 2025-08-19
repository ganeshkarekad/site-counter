// Domain database class
class DomainDB {
  constructor() {
    this.dbName = 'FoculaticsDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create domains table if it doesn't exist
        if (!db.objectStoreNames.contains('domains')) {
          const domainsStore = db.createObjectStore('domains', { keyPath: 'domain' });
          domainsStore.createIndex('lastVisit', 'lastVisit', { unique: false });
          domainsStore.createIndex('visitCount', 'visitCount', { unique: false });
        }
      };
    });
  }

  async addOrUpdateDomain(domain) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domains'], 'readwrite');
      const store = transaction.objectStore('domains');
      
      // First, try to get existing domain
      const getRequest = store.get(domain);
      
      getRequest.onsuccess = () => {
        const existingData = getRequest.result;
        const now = new Date().toISOString();
        
        const domainData = existingData ? {
          domain: domain,
          firstVisit: existingData.firstVisit,
          lastVisit: now,
          visitCount: existingData.visitCount + 1
        } : {
          domain: domain,
          firstVisit: now,
          lastVisit: now,
          visitCount: 1
        };
        
        const putRequest = store.put(domainData);
        
        putRequest.onsuccess = () => {
          resolve(domainData);
        };
        
        putRequest.onerror = () => {
          reject(new Error('Failed to save domain'));
        };
      };
      
      getRequest.onerror = () => {
        reject(new Error('Failed to get domain'));
      };
    });
  }

  async getAllDomains(sortBy = 'lastVisit') {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domains'], 'readonly');
      const store = transaction.objectStore('domains');
      const domains = [];
      
      let request;
      if (sortBy === 'lastVisit' || sortBy === 'visitCount') {
        const index = store.index(sortBy);
        request = index.openCursor(null, 'prev'); // descending order
      } else {
        request = store.openCursor();
      }
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          domains.push(cursor.value);
          cursor.continue();
        } else {
          resolve(domains);
        }
      };
      
      request.onerror = () => {
        reject(new Error('Failed to fetch domains'));
      };
    });
  }

  async getDomainsForPeriod(period) {
    const domains = await this.getAllDomains();
    const now = new Date();
    
    const filterByDate = (date) => {
      const visitDate = new Date(date);
      
      switch(period) {
        case 'today':
          // Check if visit was today (same date)
          return visitDate.toDateString() === now.toDateString();
        case 'week':
          // Check if visit was within the last 7 days
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return visitDate >= oneWeekAgo;
        case 'month':
          // Check if visit was within the last 30 days
          const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return visitDate >= oneMonthAgo;
        case 'all':
        default:
          return true;
      }
    };
    
    return domains.filter(domain => filterByDate(domain.lastVisit));
  }

  async clearAllDomains() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domains'], 'readwrite');
      const store = transaction.objectStore('domains');
      const request = store.clear();
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        reject(new Error('Failed to clear domains'));
      };
    });
  }
}

const domainDB = new DomainDB();
let trackingEnabled = true;

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  chrome.storage.local.set({ installed: true, trackingEnabled: true });
  // Initialize database
  domainDB.init();
});

// Load tracking state from storage
chrome.storage.local.get(['trackingEnabled'], (result) => {
  trackingEnabled = result.trackingEnabled !== false; // Default to true if not set
  updateBadge(); // Initialize badge for current tab
});

// Function to update extension icon badge with visit count or status
async function updateBadge(tabId = null) {
  if (!trackingEnabled) {
    // Show "OFF" badge when tracking is disabled
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc3545' }); // Red color
    chrome.action.setTitle({ title: 'Foculatics: Site Tracker - Paused' });
    return;
  }

  // If no tabId provided, get the current active tab
  if (!tabId) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) return;
      tabId = tabs[0].id;
    } catch (error) {
      console.error('Error getting active tab:', error);
      return;
    }
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) {
      // Clear badge for non-http URLs
      chrome.action.setBadgeText({ text: '', tabId });
      chrome.action.setTitle({ title: 'Foculatics: Site Tracker - Active', tabId });
      return;
    }

    const url = new URL(tab.url);
    const domain = url.hostname;
    
    // Get today's visit count for this domain
    // Note: The current DB structure only tracks total visits, not daily visits
    // For now, we'll show total visits but this could be enhanced to track daily visits
    const domains = await domainDB.getAllDomains();
    const domainData = domains.find(d => d.domain === domain);
    
    let visitCount = 0;
    if (domainData) {
      // Check if the domain was visited today
      const today = new Date();
      const lastVisit = new Date(domainData.lastVisit);
      const daysDiff = (today - lastVisit) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 1) {
        // If visited today, show total count (we'll enhance this later for daily counts)
        visitCount = domainData.visitCount;
      }
    }
    
    console.log(`Badge update for ${domain}: ${visitCount} visits today`);
    
    // Update badge with visit count
    chrome.action.setBadgeText({ 
      text: visitCount > 0 ? visitCount.toString() : '', 
      tabId 
    });
    chrome.action.setBadgeBackgroundColor({ 
      color: '#20c997', // Teal color to match theme
      tabId 
    });
    chrome.action.setTitle({ 
      title: `Foculatics: ${domain} visited ${visitCount} times today`, 
      tabId 
    });
    
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'test') {
    console.log('Test message received from popup');
    sendResponse({ success: true, message: 'Background script is working!' });
  }
  
  if (request.action === 'toggleTracking') {
    trackingEnabled = request.enabled;
    chrome.storage.local.set({ trackingEnabled: trackingEnabled });
    updateBadge(); // Update badge for current tab
    sendResponse({ success: true });
  }
  
  if (request.action === 'trackDomain') {
    // Store domain in IndexedDB
    domainDB.addOrUpdateDomain(request.domain)
      .then(result => {
        console.log('Domain tracked:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('Failed to track domain:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getDomains') {
    // Fetch domains for specified period
    domainDB.getDomainsForPeriod(request.period || 'all')
      .then(domains => {
        // Sort by visit count by default
        domains.sort((a, b) => b.visitCount - a.visitCount);
        sendResponse({ success: true, domains: domains });
      })
      .catch(error => {
        console.error('Failed to fetch domains:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'clearDomains') {
    domainDB.clearAllDomains()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Failed to clear domains:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  return true;
});

// Track user-initiated navigation only
chrome.webNavigation.onCommitted.addListener((details) => {
  // Check if tracking is enabled
  if (!trackingEnabled) {
    return;
  }
  
  // Only track top-level navigation (not iframes)
  if (details.frameId === 0) {
    // Track only user-initiated navigation
    const userInitiatedTransitions = [
      'typed',          // User typed URL in address bar
      'auto_bookmark',  // User clicked bookmark
      'auto_toplevel',  // User navigated from address bar suggestions
      'form_submit',    // User submitted a form
      'reload',         // User reloaded page
      'link'            // User clicked a link
    ];
    
    const transitionQualifiers = details.transitionQualifiers || [];
    const transitionType = details.transitionType;
    
    // Check if this is a user-initiated navigation
    const isUserInitiated = userInitiatedTransitions.includes(transitionType) ||
                           transitionQualifiers.includes('from_address_bar');
    
    if (isUserInitiated && details.url) {
      try {
        const url = new URL(details.url);
        if (url.hostname && url.protocol.startsWith('http')) {
          domainDB.addOrUpdateDomain(url.hostname)
            .then(result => {
              console.log('User navigation tracked:', result);
              // Update badge after tracking new visit
              updateBadge(details.tabId);
            })
            .catch(error => console.error('Failed to track navigation:', error));
        }
      } catch (e) {
        console.error('Invalid URL:', details.url);
      }
    }
  }
});

// Update badge when user switches tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  updateBadge(activeInfo.tabId);
});

// Update badge when tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only update when the URL has changed and is complete
  if (changeInfo.status === 'complete' && changeInfo.url) {
    updateBadge(tabId);
  }
});