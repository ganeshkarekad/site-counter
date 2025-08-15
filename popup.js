let visitData = {};
let currentPeriod = 'today';
let chartInstance = null;
let settings = {
  showNotifications: true
};

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadVisitData();
  setupEventListeners();
  setupMessageListener();
});

function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
  document.getElementById('clearDataBtn').addEventListener('click', handleClearData);
  document.getElementById('settingsToggle').addEventListener('click', toggleSettings);
  document.getElementById('notificationToggle').addEventListener('change', handleNotificationToggle);
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentPeriod = e.target.dataset.period;
      updateDisplay();
    });
  });
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'dataRefreshed') {
      loadVisitData();
    }
  });
}

async function loadVisitData() {
  chrome.runtime.sendMessage({ action: 'getVisitData' }, response => {
    if (response && response.success) {
      visitData = response.data || {};
      updateLastRefreshTime(response.lastRefresh);
      updateDisplay();
    }
  });
}

async function handleRefresh() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;
  
  chrome.runtime.sendMessage({ action: 'refreshData' }, response => {
    setTimeout(() => {
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
      if (response && response.success) {
        loadVisitData();
      }
    }, 500);
  });
}

async function handleClearData() {
  if (confirm('Are you sure you want to clear all tracking data? This cannot be undone.')) {
    chrome.runtime.sendMessage({ action: 'clearAllData' }, response => {
      if (response && response.success) {
        visitData = {};
        updateDisplay();
      }
    });
  }
}

function updateLastRefreshTime(timestamp) {
  const element = document.getElementById('lastRefreshTime');
  if (timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / 60000);
    
    if (diffMinutes < 1) {
      element.textContent = 'Just now';
    } else if (diffMinutes < 60) {
      element.textContent = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      element.textContent = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }
  } else {
    element.textContent = 'Never';
  }
}

function filterDataByPeriod(data, period) {
  const now = new Date();
  const today = new Date(now.toDateString());
  const filtered = {};
  
  for (const [domain, siteData] of Object.entries(data)) {
    let count = 0;
    
    if (period === 'all') {
      count = siteData.count;
    } else {
      const cutoffDate = new Date(today);
      if (period === 'today') {
        cutoffDate.setDate(cutoffDate.getDate());
      } else if (period === '7days') {
        cutoffDate.setDate(cutoffDate.getDate() - 6);
      } else if (period === '30days') {
        cutoffDate.setDate(cutoffDate.getDate() - 29);
      }
      
      for (const [dateKey, visits] of Object.entries(siteData.dailyVisits)) {
        const visitDate = new Date(dateKey);
        if (visitDate >= cutoffDate) {
          count += visits;
        }
      }
    }
    
    if (count > 0) {
      filtered[domain] = count;
    }
  }
  
  return filtered;
}

function updateDisplay() {
  const filteredData = filterDataByPeriod(visitData, currentPeriod);
  
  const sortedSites = Object.entries(filteredData)
    .sort((a, b) => b[1] - a[1]);
  
  const totalSites = sortedSites.length;
  const totalVisits = sortedSites.reduce((sum, [_, count]) => sum + count, 0);
  
  document.getElementById('totalSites').textContent = totalSites.toLocaleString();
  document.getElementById('totalVisits').textContent = totalVisits.toLocaleString();
  
  updateChart(sortedSites);
  updateTopSitesList(sortedSites.slice(0, 10));
}

function updateChart(sortedSites) {
  const ctx = document.getElementById('visitChart').getContext('2d');
  
  const top5 = sortedSites.slice(0, 5);
  const otherCount = sortedSites.slice(5).reduce((sum, [_, count]) => sum + count, 0);
  
  const labels = top5.map(([domain, _]) => {
    return domain.length > 20 ? domain.substring(0, 17) + '...' : domain;
  });
  const data = top5.map(([_, count]) => count);
  
  if (otherCount > 0) {
    labels.push('Other');
    data.push(otherCount);
  }
  
  const colors = [
    '#3b82f6',
    '#10b981', 
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#6b7280'
  ];
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff',
        spacing: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 12,
            font: {
              size: 11,
              family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
            },
            usePointStyle: true,
            pointStyle: 'circle',
            generateLabels: function(chart) {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: `${label} (${data.datasets[0].data[i].toLocaleString()})`,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 13,
            weight: '600'
          },
          bodyFont: {
            size: 12
          },
          displayColors: true,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value.toLocaleString()} visits (${percentage}%)`;
            }
          }
        }
      },
      animation: {
        animateRotate: true,
        animateScale: false,
        duration: 600,
        easing: 'easeInOutQuart'
      }
    }
  });
}

function updateTopSitesList(topSites) {
  const container = document.getElementById('topSitesList');
  
  if (topSites.length === 0) {
    container.innerHTML = '<div class="no-data">No visit data available for this period</div>';
    return;
  }
  
  container.innerHTML = topSites.map(([domain, count], index) => `
    <div class="site-item">
      <span class="site-rank">${index + 1}</span>
      <span class="site-domain" title="${domain}">${domain}</span>
      <span class="site-count">${count.toLocaleString()}</span>
    </div>
  `).join('');
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    if (result.settings) {
      settings = { ...settings, ...result.settings };
    }
    
    // Update UI to reflect loaded settings
    const notificationToggle = document.getElementById('notificationToggle');
    notificationToggle.checked = settings.showNotifications;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({ settings });
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

function toggleSettings() {
  const settingsContent = document.getElementById('settingsContent');
  const settingsToggle = document.getElementById('settingsToggle');
  
  settingsContent.classList.toggle('settings-expanded');
  settingsToggle.classList.toggle('settings-active');
}

async function handleNotificationToggle(event) {
  settings.showNotifications = event.target.checked;
  await saveSettings();
  
  // Notify background script of settings change
  chrome.runtime.sendMessage({
    action: 'settingsUpdated',
    settings: settings
  });
}