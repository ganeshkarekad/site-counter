// Debug utility for Site Tracker Extension
// Run this in the browser console to check data state

async function debugSiteTracker() {
  console.log('=== Site Tracker Debug Info ===');
  
  try {
    // Check storage data
    const storageData = await chrome.storage.local.get(['customVisitData', 'settings', 'siteTrackerDomainTimestamps']);
    
    console.log('\n📦 Storage Data:');
    console.log('customVisitData domains:', Object.keys(storageData.customVisitData || {}).length);
    console.log('settings:', storageData.settings);
    console.log('domain timestamps:', Object.keys(storageData.siteTrackerDomainTimestamps || {}).length);
    
    // Detailed visit data
    if (storageData.customVisitData) {
      console.log('\n📊 Visit Data Details:');
      Object.entries(storageData.customVisitData).forEach(([domain, data]) => {
        console.log(`${domain}:`, {
          totalVisits: data.totalVisits,
          totalTime: Math.round(data.totalTime / 1000) + 's',
          dailyVisits: Object.keys(data.dailyVisits || {}).length + ' days',
          sessions: (data.sessions || []).length + ' sessions'
        });
      });
    }
    
    // Check if background script is responding
    console.log('\n🔄 Testing Background Script...');
    chrome.runtime.sendMessage({ action: 'getVisitData' }, (response) => {
      if (response) {
        console.log('✅ Background script responding');
        console.log('Response data domains:', Object.keys(response.data || {}).length);
      } else {
        console.log('❌ Background script not responding');
      }
    });
    
    // Memory usage
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      console.log('\n💾 Storage Usage:');
      console.log('Used:', Math.round(estimate.usage / 1024) + 'KB');
      console.log('Available:', Math.round(estimate.quota / 1024 / 1024) + 'MB');
    }
    
    // Extension info
    console.log('\n🔧 Extension Info:');
    console.log('Extension ID:', chrome.runtime.id);
    console.log('Manifest:', chrome.runtime.getManifest().version);
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

// Auto-run debug
debugSiteTracker();

// Export for manual use
window.debugSiteTracker = debugSiteTracker;