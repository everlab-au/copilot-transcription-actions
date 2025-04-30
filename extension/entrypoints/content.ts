export default defineContentScript({
  matches: [
    '*://*.google.com/meet/*',    // Google Meet
    '*://*.zoom.us/*',           // Zoom
    '*://*.teams.microsoft.com/*' // Microsoft Teams
  ],
  main() {
    console.log('Meeting Assistant content script loaded');
    
    // Listen for messages from the sidepanel
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getTabInfo') {
        // Respond with tab information
        sendResponse({ 
          url: window.location.href,
          title: document.title
        });
      }
    });
  },
});
