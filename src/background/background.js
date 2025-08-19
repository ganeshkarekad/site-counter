// Domain database class
class DomainDB {
  constructor() {
    this.dbName = 'FoculaticsDB';
    this.version = 2; // Increment version for schema change
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
        
        // Create visits table to track individual visits
        if (!db.objectStoreNames.contains('visits')) {
          const visitsStore = db.createObjectStore('visits', { keyPath: 'id', autoIncrement: true });
          visitsStore.createIndex('domain', 'domain', { unique: false });
          visitsStore.createIndex('timestamp', 'timestamp', { unique: false });
          visitsStore.createIndex('domain_timestamp', ['domain', 'timestamp'], { unique: false });
        }
      };
    });
  }

  async addOrUpdateDomain(domain) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domains', 'visits'], 'readwrite');
      const domainsStore = transaction.objectStore('domains');
      const visitsStore = transaction.objectStore('visits');
      
      // First, try to get existing domain
      const getRequest = domainsStore.get(domain);
      
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
        
        // Save domain data
        const putRequest = domainsStore.put(domainData);
        
        putRequest.onsuccess = () => {
          // Also save individual visit record
          const visitData = {
            domain: domain,
            timestamp: now
          };
          
          const visitRequest = visitsStore.add(visitData);
          
          visitRequest.onsuccess = () => {
            resolve(domainData);
          };
          
          visitRequest.onerror = () => {
            // Still resolve even if visit record fails
            resolve(domainData);
          };
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
    if (!this.db) await this.init();
    
    return new Promise(async (resolve, reject) => {
      try {
        // Get all domains first
        const domains = await this.getAllDomains();
        const now = new Date();
        
        // Calculate date boundaries
        let startDate;
        switch(period) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'all':
          default:
            startDate = new Date(0); // Beginning of time
            break;
        }
        
        // Get visits for the period
        const transaction = this.db.transaction(['visits'], 'readonly');
        const visitsStore = transaction.objectStore('visits');
        const visitsIndex = visitsStore.index('timestamp');
        
        const visitCounts = {};
        const lastVisits = {};
        
        const range = IDBKeyRange.lowerBound(startDate.toISOString());
        const request = visitsIndex.openCursor(range);
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const visit = cursor.value;
            // Count visits per domain for this period
            visitCounts[visit.domain] = (visitCounts[visit.domain] || 0) + 1;
            // Track last visit time in this period
            if (!lastVisits[visit.domain] || visit.timestamp > lastVisits[visit.domain]) {
              lastVisits[visit.domain] = visit.timestamp;
            }
            cursor.continue();
          } else {
            // Process complete - build result with period-specific counts
            const result = domains
              .filter(domain => visitCounts[domain.domain] > 0)
              .map(domain => ({
                ...domain,
                visitCount: visitCounts[domain.domain] || 0,
                lastVisit: lastVisits[domain.domain] || domain.lastVisit,
                periodVisitCount: visitCounts[domain.domain] || 0 // Add period-specific count
              }));
            
            resolve(result);
          }
        };
        
        request.onerror = () => {
          reject(new Error('Failed to fetch visits'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async clearAllDomains() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domains', 'visits'], 'readwrite');
      const domainsStore = transaction.objectStore('domains');
      const visitsStore = transaction.objectStore('visits');
      
      const domainsClearRequest = domainsStore.clear();
      const visitsClearRequest = visitsStore.clear();
      
      let clearedDomains = false;
      let clearedVisits = false;
      
      const checkComplete = () => {
        if (clearedDomains && clearedVisits) {
          resolve();
        }
      };
      
      domainsClearRequest.onsuccess = () => {
        clearedDomains = true;
        checkComplete();
      };
      
      visitsClearRequest.onsuccess = () => {
        clearedVisits = true;
        checkComplete();
      };
      
      domainsClearRequest.onerror = () => {
        reject(new Error('Failed to clear domains'));
      };
      
      visitsClearRequest.onerror = () => {
        reject(new Error('Failed to clear visits'));
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
    
    // Get today's visit count for this domain using the new period-based method
    const todayDomains = await domainDB.getDomainsForPeriod('today');
    const domainData = todayDomains.find(d => d.domain === domain);
    
    let visitCount = domainData ? domainData.periodVisitCount : 0;
    
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
        // Sort based on request parameter or default to lastVisit
        const sortBy = request.sortBy || 'lastVisit';
        if (sortBy === 'visitCount') {
          domains.sort((a, b) => b.visitCount - a.visitCount);
        } else if (sortBy === 'lastVisit') {
          domains.sort((a, b) => new Date(b.lastVisit) - new Date(a.lastVisit));
        }
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