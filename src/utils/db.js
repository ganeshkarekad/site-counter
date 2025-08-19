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
      const daysDiff = (now - visitDate) / (1000 * 60 * 60 * 24);
      
      switch(period) {
        case 'today':
          return daysDiff < 1;
        case 'week':
          return daysDiff < 7;
        case 'month':
          return daysDiff < 30;
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

export default new DomainDB();