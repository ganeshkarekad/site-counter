import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

function App() {
  const [activeTab, setActiveTab] = useState("today");
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const [domains, setDomains] = useState([]);
  const [displayedDomains, setDisplayedDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [popupEnabled, setPopupEnabled] = useState(true);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    right: 0,
  });
  const tabRefs = useRef({});
  const settingsRef = useRef(null);
  const settingsButtonRef = useRef(null);

  const INITIAL_DISPLAY_COUNT = 3;
  const LOAD_MORE_COUNT = 5;

  useEffect(() => {
    updateIndicator(activeTab);
    fetchDomains(activeTab);
  }, [activeTab]);

  useEffect(() => {
    // Load settings from chrome storage
    chrome.storage.local.get(["popupEnabled", "trackingEnabled"], (result) => {
      if (result.popupEnabled !== undefined) {
        setPopupEnabled(result.popupEnabled);
      }
      if (result.trackingEnabled !== undefined) {
        setTrackingEnabled(result.trackingEnabled);
      }
    });
  }, []);

  useEffect(() => {
    // Handle clicks outside settings dropdown
    const handleClickOutside = (event) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(event.target)
      ) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSettings]);

  const updateIndicator = (tabName) => {
    const activeElement = tabRefs.current[tabName];
    if (activeElement) {
      const { offsetLeft, offsetWidth, offsetHeight } = activeElement;
      setIndicatorStyle({
        left: `${offsetLeft}px`,
        width: `${offsetWidth}px`,
        height: `${offsetHeight}px`,
        top: "50%",
        transform: "translateY(-50%)",
      });
    }
  };

  const fetchDomains = async (period) => {
    setLoading(true);
    try {
      // Map the tab names to period values
      const periodMap = {
        today: "today",
        week: "week",
        month: "month",
        all: "all",
      };

      const mappedPeriod = periodMap[period] || "all";

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "getDomains", period: mappedPeriod },
          (response) => resolve(response),
        );
      });

      if (response && response.success) {
        const domainsData = response.domains || [];
        setDomains(domainsData);
        setDisplayedDomains(domainsData.slice(0, INITIAL_DISPLAY_COUNT));
        setShowMore(domainsData.length > INITIAL_DISPLAY_COUNT);
      } else {
        console.error("Failed to fetch domains:", response?.error);
        setDomains([]);
        setDisplayedDomains([]);
        setShowMore(false);
      }
    } catch (error) {
      console.error("Error fetching domains:", error);
      setDomains([]);
      setDisplayedDomains([]);
      setShowMore(false);
    }
    setLoading(false);
  };

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  const handleLoadMore = () => {
    const currentCount = displayedDomains.length;
    const newCount = Math.min(currentCount + LOAD_MORE_COUNT, domains.length);
    const newDisplayedDomains = domains.slice(0, newCount);

    setDisplayedDomains(newDisplayedDomains);

    // Hide "Load More" button if all domains are now displayed
    if (newCount >= domains.length) {
      setShowMore(false);
    }
  };

  const handleTogglePopup = (e) => {
    const newValue = e.target.checked;
    setPopupEnabled(newValue);
    chrome.storage.local.set({ popupEnabled: newValue });

    // Send message to all tabs to enable/disable popup
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs
          .sendMessage(tab.id, {
            action: "togglePopup",
            enabled: newValue,
          })
          .catch(() => {}); // Ignore errors for tabs that don't have content script
      });
    });
  };

  const handleToggleTracking = (e) => {
    const newValue = e.target.checked;
    setTrackingEnabled(newValue);
    chrome.storage.local.set({ trackingEnabled: newValue });

    // Send message to background script
    chrome.runtime.sendMessage({
      action: "toggleTracking",
      enabled: newValue,
    });
  };

  const handleClearData = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all tracking data? This action cannot be undone.",
      )
    ) {
      setLoading(true);
      chrome.runtime.sendMessage({ action: "clearDomains" }, (response) => {
        if (response && response.success) {
          // Refresh the current tab data after clearing
          setDomains([]);
          setDisplayedDomains([]);
          setShowMore(false);
          // Close settings dropdown
          setShowSettings(false);
        } else {
          alert("Failed to clear data. Please try again.");
        }
        setLoading(false);
      });
    }
  };

  const handleSettingsClick = () => {
    if (!showSettings && settingsButtonRef.current) {
      const rect = settingsButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setShowSettings(!showSettings);
  };

  // Settings dropdown component
  const SettingsDropdown = () => {
    if (!showSettings) return null;

    return createPortal(
      <div
        ref={settingsRef}
        className="settings-dropdown"
        style={{
          position: "fixed",
          top: `${dropdownPosition.top}px`,
          right: `${dropdownPosition.right}px`,
          zIndex: 2147483647, // Maximum z-index value
        }}
      >
        <div className="settings-header">
          <h6 className="mb-0">Settings</h6>
        </div>

        <div className="settings-item">
          <div className="settings-item-content">
            <div className="fw-medium">Site Visit Popup</div>
            <small className="text-muted">Show visit count on websites</small>
          </div>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="popupToggle"
              checked={popupEnabled}
              onChange={handleTogglePopup}
            />
          </div>
        </div>

        <div className="settings-item">
          <div className="settings-item-content">
            <div className="fw-medium">Site Tracking</div>
            <small className="text-muted">
              {trackingEnabled ? "Tracking active" : "Tracking paused"}
            </small>
          </div>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="trackingToggle"
              checked={trackingEnabled}
              onChange={handleToggleTracking}
            />
          </div>
        </div>

        <div className="settings-item">
          <div className="settings-item-content">
            <div className="fw-medium">Clear All Data</div>
            <small className="text-muted">Remove all tracking data</small>
          </div>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={handleClearData}
            disabled={loading}
          >
            {loading ? "Clearing..." : "Clear"}
          </button>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="container py-3">
      <div className="header-section">
        <div className="bg-illustrations">
          <svg
            className="icon-hourglass"
            width="24"
            height="24"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.133l.941.502A2 2 0 0 1 16 5.4V6a2 2 0 0 1-2 2v2a2 2 0 0 1 2 2v.6a2 2 0 0 1-1.059 1.765l-.941.502V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1.133l-.941-.502A2 2 0 0 1 0 10.6V10a2 2 0 0 1 2-2V6a2 2 0 0 1-2-2v-.6a2 2 0 0 1 1.059-1.765L2 1.133V2zm1 8.5V14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.5l-.5.5a1 1 0 0 1-1.5-.5v-1a1 1 0 0 1 1.5-.5l.5.5V5.5l-.5-.5a1 1 0 0 1-1.5.5v1a1 1 0 0 1-1.5.5L3 6.5v4zm9.854-.354a.5.5 0 0 0 0 .708l2 2a.5.5 0 0 0 .708-.708l-2-2a.5.5 0 0 0-.708 0zM2.146 5.854a.5.5 0 0 1 0-.708l2-2a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0z" />
          </svg>

          <svg
            className="icon-clock"
            width="28"
            height="28"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
            <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
          </svg>

          <svg
            className="icon-book"
            width="26"
            height="26"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z" />
          </svg>

          <svg
            className="icon-pencil"
            width="22"
            height="22"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
          </svg>

          <svg
            className="icon-pen"
            width="20"
            height="20"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="m13.498.795.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796a1.5 1.5 0 0 1 1.998-.001zm-.644.766a.5.5 0 0 0-.707 0L1.95 11.756l-.764 3.057 3.057-.764L14.44 3.854a.5.5 0 0 0 0-.708l-1.585-1.585z" />
          </svg>
        </div>

        <div className="header-content">
          <div className="row align-items-center">
            <div className="col-2 d-flex justify-content-start">
              <div className="logo">
                <img
                  src="/icons/icon128.png"
                  width="36"
                  height="36"
                  alt="Foculatics"
                />
              </div>
            </div>
            <div className="col-7 d-flex justify-content-center">
              <h3 className="mb-0 text-center w-100">Foculatics</h3>
            </div>
            <div className="col-3 d-flex justify-content-end position-relative">
              <button
                ref={settingsButtonRef}
                className="btn settings-btn p-0"
                title="Settings"
                type="button"
                onClick={handleSettingsClick}
              >
                <svg fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
                  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ul className="nav nav-pills nav-fill mt-3 flex-nowrap nav-pills-animated">
        <div className="tab-indicator" style={indicatorStyle}></div>
        <li className="nav-item">
          <button
            ref={(el) => (tabRefs.current["today"] = el)}
            className={`nav-link px-2 py-1 text-nowrap ${activeTab === "today" ? "active" : ""}`}
            onClick={() => handleTabClick("today")}
          >
            Today
          </button>
        </li>
        <li className="nav-item">
          <button
            ref={(el) => (tabRefs.current["week"] = el)}
            className={`nav-link px-2 py-1 text-nowrap ${activeTab === "week" ? "active" : ""}`}
            onClick={() => handleTabClick("week")}
          >
            This Week
          </button>
        </li>
        <li className="nav-item">
          <button
            ref={(el) => (tabRefs.current["month"] = el)}
            className={`nav-link px-2 py-1 text-nowrap ${activeTab === "month" ? "active" : ""}`}
            onClick={() => handleTabClick("month")}
          >
            This Month
          </button>
        </li>
        <li className="nav-item">
          <button
            ref={(el) => (tabRefs.current["all"] = el)}
            className={`nav-link px-2 py-1 text-nowrap ${activeTab === "all" ? "active" : ""}`}
            onClick={() => handleTabClick("all")}
          >
            All Time
          </button>
        </li>
      </ul>

      <div className="domains-section mt-3">
        {loading ? (
          <div className="text-center py-4">
            <div
              className="spinner-border spinner-border-sm text-primary"
              role="status"
            >
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : displayedDomains.length > 0 ? (
          <>
            <div className="list-group">
              {displayedDomains.map((domain, index) => (
                <div key={domain.domain} className="list-group-item">
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="flex-grow-1">
                      <h6 className="mb-1">{domain.domain}</h6>
                      <small className="text-muted">
                        Visits: {domain.visitCount} • Last:{" "}
                        {formatDate(domain.lastVisit)}
                      </small>
                    </div>
                    <span className="badge bg-secondary">
                      {domain.visitCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {showMore && (
              <div className="text-center mt-3">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={handleLoadMore}
                >
                  Load More (
                  {Math.min(
                    LOAD_MORE_COUNT,
                    domains.length - displayedDomains.length,
                  )}{" "}
                  more)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-muted">
            <svg
              width="48"
              height="48"
              fill="currentColor"
              className="mb-2 opacity-50"
              viewBox="0 0 16 16"
            >
              <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4.5 5.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z" />
            </svg>
            <p className="mb-0">
              No domains visited{" "}
              {activeTab === "today"
                ? "today"
                : activeTab === "week"
                  ? "this week"
                  : activeTab === "month"
                    ? "this month"
                    : "yet"}
            </p>
          </div>
        )}
      </div>

      <SettingsDropdown />
    </div>
  );
}

export default App;
