// Offscreen Document for tab audio capture in Manifest V3
console.log("Offscreen document initialized");

// DOM elements
const statusElement = document.getElementById("status");

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let tabStream = null;
let isRecording = false;
let mimeType = "audio/webm";

// Initialize
(async function init() {
  console.log("Initializing offscreen document");
  updateStatus("Ready for audio capture", "ready");

  // Notify the background script that we're ready
  chrome.runtime
    .sendMessage({
      type: "offscreen-ready",
      target: "background",
    })
    .catch((err) => {
      console.error("Error sending ready message to background:", err);
    });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Make sure the message is intended for the offscreen document
    if (message.target !== "offscreen") return;

    console.log("Offscreen received message:", message.type);

    if (message.type === "start-recording") {
      const streamId = message.data;
      startRecording(streamId);
      return true;
    }

    if (message.type === "stop-recording") {
      stopRecording();
      return true;
    }

    return false;
  });
})();

// Helper function to update the status display
function updateStatus(message, type = "ready") {
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = type;
    console.log(`Status: ${message}`);
  }
}

// Get the best supported mime type
function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`Using mime type: ${type}`);
      return type;
    }
  }

  console.log(`Fallback to default mime type: audio/webm`);
  return "audio/webm";
}

// Start recording tab audio
async function startRecording(streamId) {
  try {
    updateStatus("Starting tab audio capture...", "recording");

    if (isRecording) {
      console.warn("Already recording, stopping previous recording first");
      await stopRecording();
    }

    console.log("Getting tab media stream with ID:", streamId);

    // Get the media stream using the provided stream ID
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    console.log("Tab stream obtained:", tabStream);

    // Use the best supported mime type
    mimeType = getSupportedMimeType();

    // Initialize the MediaRecorder with the stream
    mediaRecorder = new MediaRecorder(tabStream, { mimeType });
    recordedChunks = [];

    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);

        // Send a chunk to the background script - for real-time processing if needed
        chrome.runtime
          .sendMessage({
            type: "audio-data",
            target: "background",
            size: event.data.size,
          })
          .catch((err) => {
            console.error("Error sending audio data message:", err);
          });
      }
    };

    // Handle recording stop event
    mediaRecorder.onstop = async () => {
      console.log("MediaRecorder stopped");
      updateStatus("Recording stopped, processing audio...", "ready");

      // Create a blob from all recorded chunks
      const audioBlob = new Blob(recordedChunks, { type: mimeType });
      console.log(`Recording complete: ${audioBlob.size} bytes`);

      // Convert to base64 data for transfer
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64data = reader.result;

        // Send the complete recording data to the background script
        chrome.runtime
          .sendMessage({
            type: "recording-complete",
            target: "background",
            data: base64data,
            mimeType: mimeType,
          })
          .catch((err) => {
            console.error("Error sending recording-complete message:", err);
          });

        updateStatus("Recording data sent to background script", "ready");
        isRecording = false;
      };
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every 1000ms (1 second)
    isRecording = true;

    updateStatus("Tab audio capture in progress", "recording");

    // Notify the background script that recording has started
    chrome.runtime
      .sendMessage({
        type: "recording-started",
        target: "background",
      })
      .catch((err) => {
        console.error("Error sending recording-started message:", err);
      });

    console.log("Tab audio recording started");
  } catch (error) {
    console.error("Error starting tab audio recording:", error);
    updateStatus(`Error starting recording: ${error.message}`, "error");

    // Notify the background script of the error
    chrome.runtime
      .sendMessage({
        type: "recording-error",
        target: "background",
        error: error.message,
      })
      .catch((err) => {
        console.error("Error sending recording-error message:", err);
      });
  }
}

// Stop recording tab audio
async function stopRecording() {
  try {
    if (!mediaRecorder || !isRecording) {
      console.log("No active recording to stop");
      return;
    }

    updateStatus("Stopping recording...", "ready");
    console.log("Stopping tab audio recording");

    // Stop the media recorder
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

    // Stop all tracks in the stream
    if (tabStream) {
      tabStream.getTracks().forEach((track) => track.stop());
      tabStream = null;
    }

    console.log("Tab audio recording stopped");
  } catch (error) {
    console.error("Error stopping tab audio recording:", error);
    updateStatus(`Error stopping recording: ${error.message}`, "error");

    // Still notify the background script that recording is stopping
    chrome.runtime
      .sendMessage({
        type: "recording-error",
        target: "background",
        error: error.message,
      })
      .catch((err) => {
        console.error("Error sending recording-error message:", err);
      });
  }
}
