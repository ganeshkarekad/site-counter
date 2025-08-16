# Foculatics: Site Counter - Chrome Extension

A precision analytics Chrome extension that tracks website visit counts with real-time statistics and beautiful data visualization to help you monitor your browsing habits.

## Features

- **Real-time Visit Tracking**: Automatically tracks your browsing history and caches data locally
- **Auto-refresh**: Updates cached data every 60 seconds
- **Non-intrusive Popup**: Shows today's visit count for the current site in the bottom-right corner
- **Detailed Statistics**: View comprehensive visit data through the extension popup
- **Time Filters**: Filter data by today, 7 days, 30 days, or all time
- **Visual Analytics**: Chart showing top 5 most visited sites
- **Privacy-focused**: Only stores visit counts, not full URLs or page titles

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" button
4. Select the `site-tracker` directory
5. The extension will be installed and the icon will appear in your toolbar

## Usage

### Bottom-right Popup
- Automatically appears when visiting websites
- Shows today's visit count for the current site
- Auto-hides after 5 seconds or can be manually closed

### Main Extension Popup
- Click the extension icon in the toolbar to open
- View detailed statistics and charts
- Switch between time periods using filter buttons
- Manually refresh data using the refresh button
- Clear all data using the "Clear All Data" button

## File Structure

```
site-tracker/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for data collection
├── content.js            # Content script for bottom-right popup
├── content.css           # Styles for bottom-right popup
├── popup.html            # Main popup interface
├── popup.js              # Main popup logic
├── popup.css             # Main popup styles
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── generate-icons.html   # Icon generator (for development)
└── generate-icons.js     # Node script for icon generation
```

## Testing

1. After loading the extension, visit various websites to generate visit data
2. Check the bottom-right corner for the visit count popup
3. Click the extension icon to view the main popup with statistics
4. Test filter buttons (Today, 7 Days, 30 Days, All Time)
5. Test the manual refresh button
6. Verify chart displays correctly with top sites
7. Test "Clear All Data" functionality

## Privacy

- The extension only stores domain names and visit counts
- No personal data, full URLs, or page titles are stored
- Data is stored locally in Chrome's storage
- Respects incognito mode browsing
- All data can be cleared at any time

## Permissions

The extension requires the following permissions:
- `history`: To read browsing history
- `storage`: To cache data locally
- `activeTab`: To access current tab information
- `scripting`: To inject content scripts

## Development

To modify the extension:
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh button on the Foculatics extension card
4. Test your changes

## Icon Generation

To generate custom icons:
1. Open `generate-icons.html` in a browser
2. Right-click each canvas and save the images
3. Or run `node generate-icons.js` for placeholder icons

## Troubleshooting

- **Extension not working**: Check that all permissions are granted
- **No data showing**: Wait for the auto-refresh or click manual refresh
- **Popup not appearing**: Ensure you're on a regular website (not chrome:// pages)
- **Icons not loading**: Regenerate icons using the provided tools

## License

This extension is for personal use to track browsing habits and improve productivity.