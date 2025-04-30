export default defineBackground(() => {
  console.log('Meeting Assistant background script loaded', { id: browser.runtime.id });

  // Configure the side panel to open when the action button is clicked
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting panel behavior:', error));
  
  // For accessing chrome-specific APIs 
  // @ts-ignore
  const chrome = globalThis.chrome;
  
  // Listen for messages from the sidepanel
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'captureTab') {
      // Get the current active tab
      browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {
          if (tabs.length > 0) {
            const activeTab = tabs[0];
            
            if (message.capture === 'info') {
              // Just get tab info
              browser.tabs.sendMessage(activeTab.id!, { action: 'getTabInfo' })
                .then(response => {
                  sendResponse(response);
                })
                .catch(error => {
                  console.error('Error getting tab info:', error);
                  sendResponse({ error: 'Failed to get tab info' });
                });
            } else if (message.capture === 'audio') {
              try {
                // Use chrome.tabCapture API to capture audio from the tab
                // @ts-ignore: Chrome-specific API
                chrome.tabCapture.capture({
                  audio: true,
                  video: false,
                  audioConstraints: {
                    mandatory: {
                      chromeMediaSource: 'tab',
                    }
                  }
                }, (stream: MediaStream | null) => {
                  if (stream) {
                    // Success - pass the stream back to the requestor
                    sendResponse({ stream });
                  } else {
                    // Failed to capture
                    const error = chrome.runtime.lastError 
                      ? chrome.runtime.lastError.message 
                      : 'Unknown error capturing tab audio';
                    console.error('Tab capture error:', error);
                    sendResponse({ error });
                  }
                });
                
                // Return true to indicate we'll call sendResponse asynchronously
                return true;
              } catch (error) {
                console.error('Error initiating tab capture:', error);
                sendResponse({ error: 'Failed to initiate tab capture' });
              }
            }
          } else {
            sendResponse({ error: 'No active tab found' });
          }
        })
        .catch(error => {
          console.error('Error querying tabs:', error);
          sendResponse({ error: 'Failed to query tabs' });
        });
      
      // Return true to indicate we'll call sendResponse asynchronously
      return true;
    }
  });
});
