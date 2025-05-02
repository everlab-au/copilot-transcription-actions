// Add proper type declarations at the top
declare const defineBackground: (callback: () => void) => void;
declare const browser: {
  runtime: {
    id: string;
    onMessage: {
      addListener: (
        callback: (
          message: any,
          sender: any,
          sendResponse: (response?: any) => void
        ) => boolean | void
      ) => void;
    };
    getURL: (path: string) => string;
  };
  sidePanel: {
    setPanelBehavior: (options: {
      openPanelOnActionClick: boolean;
    }) => Promise<void>;
  };
  tabs: {
    query: (options: {
      active: boolean;
      currentWindow: boolean;
    }) => Promise<any[]>;
    sendMessage: (tabId: number, message: any) => Promise<any>;
  };
  storage: {
    local: {
      get: (keys: string | string[] | null) => Promise<Record<string, any>>;
      set: (items: Record<string, any>) => Promise<void>;
    };
  };
};

// Declare clients for service worker API
declare const clients: {
  matchAll: () => Promise<any[]>;
};

// Add the offscreen document path constant at the top of the file
const OFFSCREEN_DOCUMENT_PATH = "entrypoints/offscreen/offscreen.html";
const OFFSCREEN_REASON = "USER_MEDIA";

export default defineBackground(() => {
  console.log("Meeting Assistant background script loaded", {
    id: browser.runtime.id,
  });

  // State variables for recording and transcription
  let permissionGranted = false;
  let isRecording = false;
  let tabAudioCapturing = false;
  let offscreenDocumentReady = false;
  let recordingData: string | null = null;
  let currentRecordingMimeType: string = "audio/webm";
  let lastRecordingUrl: string | null = null;

  // Configure the side panel to open when the action button is clicked
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) =>
      console.error("Error setting panel behavior:", error)
    );

  // For accessing chrome-specific APIs
  // @ts-ignore
  const chrome = globalThis.chrome;

  // Initialize permission status from storage
  browser.storage.local.get("microphonePermissionGranted").then((result) => {
    if (result.microphonePermissionGranted) {
      permissionGranted = true;
      console.log("Microphone permission already granted from storage");
    }
  });

  // Listen for messages from the sidepanel or content scripts
  chrome.runtime.onMessage.addListener(
    (request: any, sender: any, sendResponse: any) => {
      // Handle messages meant for the background script
      if (request.message?.type) {
        const messageType = request.message.type;

        console.log("Background: received message type:", messageType);

        switch (messageType) {
          case "TOGGLE_RECORDING":
            if (request.message.data === "START") {
              initiateRecordingStart()
                .then(() => sendResponse({ success: true }))
                .catch((error: Error) => {
                  console.error("Error starting recording:", error);
                  sendResponse({ success: false, error: error.toString() });
                });
            } else if (request.message.data === "STOP") {
              initiateRecordingStop()
                .then(() => sendResponse({ success: true }))
                .catch((error: Error) => {
                  console.error("Error stopping recording:", error);
                  sendResponse({ success: false, error: error.toString() });
                });
            }
            break;

          case "CHECK_PERMISSIONS":
            // Forward permission check to offscreen
            handlePermissionCheck()
              .then((result) => {
                console.log("Background: Permission check result:", result);
                sendResponse(result);
              })
              .catch((error) => {
                console.error("Background: Permission check error:", error);
                sendResponse({
                  message: {
                    status: "error",
                    data: error?.toString() || "Unknown error",
                  },
                });
              });
            break;

          case "PLAY_RECORDING":
            sendMessageToOffscreenDocument("PLAY_RECORDING", {
              recordingId: request.message.recordingId,
            });
            break;

          case "GET_RECORDINGS":
            sendMessageToOffscreenDocument("GET_RECORDINGS");
            break;

          case "DELETE_RECORDINGS":
            sendMessageToOffscreenDocument("DELETE_RECORDINGS");
            break;

          case "PROMPT_MICROPHONE_PERMISSION":
            // Forward the message to the active tab's content script
            browser.tabs
              .query({ active: true, currentWindow: true })
              .then((tabs) => {
                if (tabs.length > 0) {
                  browser.tabs.sendMessage(tabs[0].id, {
                    action: "promptMicrophonePermission",
                  });
                }
              });
            break;

          case "TRANSCRIBE_RECORDING":
            // Handle request to transcribe a recording
            if (request.message.recordingUrl) {
              // Broadcast to all clients (including sidepanel) that we want to transcribe
              chrome.runtime.sendMessage({
                message: {
                  type: "RECORDING_COMPLETED",
                  audioUrl: request.message.recordingUrl,
                  autoTranscribe: true,
                },
              });
              sendResponse({ success: true });
            } else {
              sendResponse({
                success: false,
                error: "No recording URL provided",
              });
            }
            break;
        }
      }

      // Handle action-based messages from App.tsx (from your shared code)
      if (request.action) {
        switch (request.action) {
          case "startRecording":
            console.log("Background: Received startRecording action");
            initiateRecordingStart()
              .then(() => {
                sendResponse({ success: true });
              })
              .catch((error) => {
                console.error("Error starting recording:", error);
                sendResponse({
                  success: false,
                  error: error.toString(),
                });
              });
            return true;

          case "stopRecording":
            console.log("Background: Received stopRecording action");
            initiateRecordingStop()
              .then(() => {
                sendResponse({ success: true });
              })
              .catch((error) => {
                console.error("Error stopping recording:", error);
                sendResponse({
                  success: false,
                  error: error.toString(),
                });
              });
            return true;

          case "checkPermissionStatus":
            console.log("Background: Checking permission status");
            sendResponse({ granted: permissionGranted });
            return true;

          case "permissionGranted":
            console.log("Background: Permission granted");
            permissionGranted = true;
            browser.storage.local.set({ microphonePermissionGranted: true });

            // Broadcast permission status change
            chrome.runtime.sendMessage({
              action: "permissionStatusChanged",
              granted: true,
            });
            sendResponse({ success: true });
            return true;

          case "permissionDenied":
            console.log("Background: Permission denied");
            permissionGranted = false;
            browser.storage.local.set({ microphonePermissionGranted: false });

            // Broadcast permission status change
            chrome.runtime.sendMessage({
              action: "permissionStatusChanged",
              granted: false,
              error: request.error,
            });
            sendResponse({ success: true });
            return true;

          case "openPermissionPage":
            console.log("Background: Opening permission page");
            const permissionUrl = chrome.runtime.getURL(
              "requestPermissions/requestPermissions.html"
            );
            chrome.tabs
              .create({ url: permissionUrl })
              .then(() => {
                sendResponse({ success: true });
              })
              .catch((error: Error) => {
                console.error("Error opening permission page:", error);
                sendResponse({ success: false, error: String(error) });
              });
            return true;

          case "saveRecording":
            console.log("Background: Saving recording");
            const { audioUrl, recordingSource } = request;

            // Save recording to storage and update the lastRecordingUrl
            lastRecordingUrl = audioUrl;

            // Store in browser.storage
            browser.storage.local
              .set({
                lastRecording: {
                  url: audioUrl,
                  timestamp: new Date().toISOString(),
                  source: recordingSource || "mic",
                },
              })
              .then(() => {
                // Broadcast that recording is available for transcription
                chrome.runtime.sendMessage({
                  message: {
                    type: "RECORDING_COMPLETED",
                    audioUrl: audioUrl,
                    autoTranscribe: false,
                  },
                });

                sendResponse({ success: true });
              })
              .catch((error) => {
                console.error("Error saving recording:", error);
                sendResponse({ success: false, error: String(error) });
              });
            return true;

          case "getLastRecording":
            console.log("Background: Getting last recording");
            browser.storage.local
              .get("lastRecording")
              .then((result) => {
                sendResponse({ recording: result.lastRecording || null });
              })
              .catch((error) => {
                console.error("Error getting last recording:", error);
                sendResponse({ recording: null, error: String(error) });
              });
            return true;

          case "getTabAudioData":
            console.log("Background: Getting tab audio data");
            browser.storage.local
              .get([
                "tabAudioData",
                "tabAudioMimeType",
                "tabAudioCaptureTimestamp",
              ])
              .then((result) => {
                sendResponse({
                  tabAudioData: result.tabAudioData || null,
                  tabAudioMimeType:
                    result.tabAudioMimeType || currentRecordingMimeType,
                  timestamp: result.tabAudioCaptureTimestamp || null,
                });
              })
              .catch((error) => {
                console.error("Error getting tab audio data:", error);
                sendResponse({
                  tabAudioData: null,
                  error: String(error),
                });
              });
            return true;
        }
      }

      // Return true to indicate we'll respond asynchronously
      return true;
    }
  );

  // Function to check microphone permissions
  async function handlePermissionCheck(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("Background: Handling permission check");

        // Create offscreen document if needed for the check
        const exists = await hasOffscreenDocument();
        if (!exists) {
          await createOffscreenDocument();
        }

        // Send the check request to the offscreen document
        chrome.runtime.sendMessage(
          {
            message: {
              type: "CHECK_PERMISSIONS",
              target: "offscreen",
            },
          },
          (response: any) => {
            console.log(
              "Background: Received permission check response:",
              response
            );

            if (chrome.runtime.lastError) {
              console.error(
                "Background: Error in permission check:",
                chrome.runtime.lastError
              );
              reject(chrome.runtime.lastError);
              return;
            }

            if (!response) {
              reject(new Error("No response from offscreen document"));
              return;
            }

            resolve(response);
          }
        );
      } catch (error) {
        console.error("Background: Error handling permission check:", error);
        reject(error);
      }
    });
  }

  // Add the following functions to the existing background.ts file
  // Place them inside the defineBackground callback

  async function hasOffscreenDocument() {
    try {
      // Check if offscreen document exists using chrome.offscreen.hasDocument
      if (chrome.offscreen && chrome.offscreen.hasDocument) {
        console.log(
          "Background: Checking for offscreen document with chrome.offscreen.hasDocument"
        );
        return await chrome.offscreen.hasDocument({
          documentId: "offscreen-document",
        });
      }

      // Fallback: Check all windows controlled by the service worker
      console.log(
        "Background: Fallback check for offscreen document using clients.matchAll"
      );
      const matchingClients = await clients.matchAll();
      return matchingClients.some((client) =>
        client.url.includes(OFFSCREEN_DOCUMENT_PATH)
      );
    } catch (error) {
      console.error(
        "Background: Error checking for offscreen document:",
        error
      );
      return false;
    }
  }

  async function createOffscreenDocument() {
    try {
      // Check if document already exists
      if (await hasOffscreenDocument()) {
        console.log("Background: Offscreen document already exists");
        return;
      }

      console.log("Background: Creating offscreen document");
      await chrome.offscreen.createDocument({
        url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
        reasons: [OFFSCREEN_REASON as any],
        justification: "Used for recording audio and tab capture",
      });
      console.log("Background: Offscreen document created successfully");
    } catch (error) {
      console.error("Background: Error creating offscreen document:", error);
      throw error;
    }
  }

  async function sendMessageToOffscreenDocument(type: string, data?: any) {
    try {
      // Check if offscreen document exists, create if needed
      const exists = await hasOffscreenDocument();
      if (!exists) {
        await createOffscreenDocument();
      }

      // Send message to offscreen document
      console.log(`Background: Sending message to offscreen: ${type}`);
      chrome.runtime.sendMessage({
        message: {
          type,
          target: "offscreen",
          ...data,
        },
      });
    } catch (error) {
      console.error(
        "Background: Error sending message to offscreen document:",
        error
      );
      throw error;
    }
  }

  function initiateRecordingStart() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("Background: Initiating recording start");

        if (isRecording) {
          console.log("Background: Already recording, stopping first");
          await initiateRecordingStop();
        }

        // Reset recording state
        recordingData = null;

        // Create offscreen document if needed
        try {
          await createOffscreenDocument();
        } catch (error) {
          console.error("Error creating offscreen document:", error);
          reject(error);
          return;
        }

        // Send start recording message to offscreen document
        sendMessageToOffscreenDocument("START_OFFSCREEN_RECORDING")
          .then(() => {
            console.log("Background: Recording started");
            isRecording = true;

            // Notify UI that recording has started
            chrome.runtime.sendMessage({
              message: {
                type: "RECORDING_STATUS",
                status: "started",
              },
            });

            resolve(true);
          })
          .catch((error) => {
            console.error("Background: Error starting recording:", error);
            reject(error);
          });
      } catch (error) {
        console.error("Background: Error in initiateRecordingStart:", error);
        reject(error);
      }
    });
  }

  function initiateRecordingStop() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("Background: Initiating recording stop");

        if (!isRecording) {
          console.log("Background: Not recording, nothing to stop");
          resolve(true);
          return;
        }

        // Send stop recording message to offscreen document
        sendMessageToOffscreenDocument("STOP_OFFSCREEN_RECORDING")
          .then(() => {
            console.log("Background: Recording stopped");
            isRecording = false;

            // Check for lastRecordingUrl
            if (lastRecordingUrl) {
              // Notify UI that recording has stopped and provide URL
              chrome.runtime.sendMessage({
                message: {
                  type: "RECORDING_STATUS",
                  status: "stopped",
                  recordingUrl: lastRecordingUrl,
                },
              });
            } else {
              // Just notify that recording stopped
              chrome.runtime.sendMessage({
                message: {
                  type: "RECORDING_STATUS",
                  status: "stopped",
                },
              });
            }

            resolve(true);
          })
          .catch((error) => {
            console.error("Background: Error stopping recording:", error);
            reject(error);
          });
      } catch (error) {
        console.error("Background: Error in initiateRecordingStop:", error);
        reject(error);
      }
    });
  }
});
