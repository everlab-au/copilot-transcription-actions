/**
 * MediaRecorder instance for audio recording.
 * @type {MediaRecorder}
 */
let mediaRecorder;

/**
 * Array to store audio chunks.
 * @type {Blob[]}
 */
let audioChunks = [];

/**
 * Array to store completed recordings
 * @type {Array<{ id: string, blob: Blob, timestamp: number }>}
 */
let recordings = [];

/**
 * The sample rate for audio recording.
 * @type {number}
 */
const SAMPLE_RATE = 16000;

/**
 * Event listener for messages from the extension.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Offscreen: Received message:", request);

  if (request.message.target !== "offscreen") {
    console.log("Offscreen: Message not targeted for offscreen, ignoring");
    return;
  }

  switch (request.message.type) {
    case "START_OFFSCREEN_RECORDING":
      console.log("Offscreen: Starting recording");
      // Start recording
      handleRecording();
      sendResponse({});
      break;
    case "STOP_OFFSCREEN_RECORDING":
      console.log("Offscreen: Stopping recording");
      // Stop recording
      stopRecording();
      sendResponse({});
      break;
    case "CHECK_PERMISSIONS":
      console.log("Offscreen: Checking permissions");
      checkAudioPermissions()
        .then((data) => sendResponse(data))
        .catch((errorData) => sendResponse(errorData));
      break;
    case "GET_RECORDINGS":
      console.log(
        "Offscreen: Getting recordings list, current count:",
        recordings.length
      );
      // Create a response with the recordings list
      const recordingsList = recordings.map((rec) => ({
        id: rec.id,
        timestamp: rec.timestamp,
        duration: rec.duration || 0,
      }));
      console.log("Offscreen: Sending recordings list:", recordingsList);
      sendResponse({
        message: {
          type: "RECORDINGS_LIST",
          recordings: recordingsList,
        },
      });
      break;
    case "PLAY_RECORDING":
      console.log(
        "Offscreen: Play recording request received for:",
        request.message.recordingId
      );
      // Play specific recording by ID
      const recordingId = request.message.recordingId;
      playRecording(recordingId)
        .then(() => {
          console.log("Offscreen: Playback initiated successfully");
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error("Offscreen: Playback error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to play recording",
          });
        });
      break;
    case "DELETE_RECORDINGS":
      console.log("Offscreen: Deleting all recordings");
      // Clear all recordings
      recordings = [];
      sendResponse({ success: true });
      break;
    default:
      console.log("Offscreen: Unknown message type:", request.message.type);
      break;
  }

  return true;
});

/**
 * Stops the recording if the MediaRecorder is in the recording state.
 */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    console.log("Stopped recording in offscreen...");
    mediaRecorder.stop();
  }
}

/**
 * Initiates the audio recording process using MediaRecorder.
 */
async function handleRecording() {
  try {
    console.log("Offscreen: Starting audio recording process");

    // First make sure we have permission
    try {
      // Check permissions first - this will trigger the prompt if needed
      const permissionResult = await new Promise((resolve, reject) => {
        navigator.permissions
          .query({ name: "microphone" })
          .then((result) => resolve(result))
          .catch((error) => reject(error));
      });

      console.log(
        "Offscreen: Permission check result:",
        permissionResult.state
      );

      if (permissionResult.state === "denied") {
        throw new Error("Microphone permission denied");
      }
    } catch (permError) {
      console.error("Offscreen: Permission check failed:", permError);
      // Continue anyway, getUserMedia will also check permissions
    }

    // Try to get available audio input devices
    const audioInputDevices = await getAudioInputDevices();
    console.log("Offscreen: Found audio devices:", audioInputDevices.length);

    if (audioInputDevices.length === 0) {
      const error = new Error("No audio input devices found");
      console.error(error);
      chrome.runtime.sendMessage({
        message: {
          type: "RECORDING_ERROR",
          error: error.message,
        },
      });
      return;
    }

    // Get the first available device
    const deviceId = audioInputDevices[0].deviceId;
    console.log(
      "Offscreen: Using audio device ID:",
      deviceId.substring(0, 8) + "..."
    );

    // Get audio stream with specific constraints for Whisper
    console.log("Offscreen: Requesting audio stream with specific constraints");
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
      },
    });

    console.log("Offscreen: Successfully acquired audio stream");

    // Clear previous audio chunks
    audioChunks = [];

    // Create and configure the MediaRecorder
    mediaRecorder = new MediaRecorder(audioStream);
    console.log(
      "Offscreen: Created MediaRecorder with MIME type:",
      mediaRecorder.mimeType
    );

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && mediaRecorder.state === "recording") {
        audioChunks.push(event.data);
        console.log(
          `Offscreen: Received audio chunk of size: ${(
            event.data.size / 1024
          ).toFixed(2)} KB`
        );
        // Send the audio data to the sidepanel
        sendAudioData(event.data);
      }
    };

    mediaRecorder.onstop = handleStopRecording;

    // Start MediaRecorder and capture chunks every 3 seconds
    mediaRecorder.start(3000);

    // Send notification that recording has started
    chrome.runtime.sendMessage({
      message: {
        type: "RECORDING_STATUS",
        status: "started",
      },
    });

    console.log("Offscreen: Successfully started recording");
  } catch (error) {
    console.error("Offscreen: Failed to initiate recording:", error);

    // Determine the specific error
    let errorMessage = "Failed to start recording";

    if (
      error.name === "NotAllowedError" ||
      error.message.includes("permission")
    ) {
      errorMessage = "Microphone permission denied or not available";
    } else if (error.name === "NotFoundError") {
      errorMessage = "No microphone found or available";
    } else if (error.name === "NotReadableError") {
      errorMessage = "Microphone is already in use by another application";
    }

    // Send error notification to the sidepanel
    chrome.runtime.sendMessage({
      message: {
        type: "RECORDING_ERROR",
        error: errorMessage,
        details: error.toString(),
      },
    });
  }
}

/**
 * Sends audio data to the sidepanel for processing.
 * @param {Blob} audioBlob - The audio data blob.
 */
function sendAudioData(audioBlob) {
  // Convert Blob to ArrayBuffer to send via message
  const reader = new FileReader();
  reader.onload = () => {
    const arrayBuffer = reader.result;
    chrome.runtime.sendMessage({
      message: {
        type: "AUDIO_DATA",
        data: arrayBuffer,
      },
    });
  };
  reader.readAsArrayBuffer(audioBlob);
}

/**
 * Event handler for when MediaRecorder is stopped.
 */
function handleStopRecording() {
  console.log("Offscreen: MediaRecorder stopped, processing recording...");

  // Create a single blob from all the chunks
  const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
  console.log("Offscreen: Created audio blob of size:", audioBlob.size);

  // Store the complete recording with a unique ID
  const recordingId = generateUniqueId();
  const recordingTimestamp = Date.now();

  // Get blob duration
  getBlobDuration(audioBlob)
    .then((duration) => {
      console.log(`Offscreen: Audio duration: ${duration}s`);

      // Add recording to the list
      recordings.push({
        id: recordingId,
        blob: audioBlob,
        timestamp: recordingTimestamp,
        duration: duration,
      });

      console.log(
        "Offscreen: Recording added, total recordings:",
        recordings.length
      );

      // Notify that a new recording is available
      chrome.runtime.sendMessage({
        message: {
          type: "NEW_RECORDING_AVAILABLE",
          recordingId: recordingId,
          timestamp: recordingTimestamp,
          duration: duration,
        },
      });
    })
    .catch((err) => {
      console.error("Offscreen: Error getting audio duration:", err);

      // Still save the recording even if we can't get the duration
      recordings.push({
        id: recordingId,
        blob: audioBlob,
        timestamp: recordingTimestamp,
        duration: 0,
      });

      // Notify that a new recording is available
      chrome.runtime.sendMessage({
        message: {
          type: "NEW_RECORDING_AVAILABLE",
          recordingId: recordingId,
          timestamp: recordingTimestamp,
          duration: 0,
        },
      });
    });

  // Send the final complete audio data
  sendAudioData(audioBlob);

  // Send notification that recording has stopped
  chrome.runtime.sendMessage({
    message: {
      type: "RECORDING_STATUS",
      status: "stopped",
    },
  });

  // Clear array for next recording
  audioChunks = [];
}

/**
 * Plays a recording with the given ID.
 * @param {string} recordingId - The ID of the recording to play.
 * @returns {Promise<void>} - A promise that resolves when playback starts.
 */
function playRecording(recordingId) {
  return new Promise((resolve, reject) => {
    const recording = recordings.find((rec) => rec.id === recordingId);

    if (!recording) {
      console.error(`Offscreen: Recording with ID ${recordingId} not found`);
      reject(new Error(`Recording with ID ${recordingId} not found`));
      return;
    }

    // Create a URL for the recording blob
    const audioURL = URL.createObjectURL(recording.blob);
    console.log("Offscreen: Created audio URL for playback:", audioURL);

    // Send the URL to the sidepanel for playback
    chrome.runtime.sendMessage({
      message: {
        type: "RECORDING_PLAYBACK",
        recordingId: recordingId,
        audioURL: audioURL,
      },
    });

    resolve();
  });
}

/**
 * Generate a unique ID for recordings.
 * @returns {string} - A unique ID.
 */
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Gets the duration of an audio blob.
 * @param {Blob} audioBlob - The audio blob.
 * @returns {Promise<number>} - Promise that resolves to the duration in seconds.
 */
function getBlobDuration(audioBlob) {
  return new Promise((resolve, reject) => {
    const tempAudio = new Audio();
    tempAudio.src = URL.createObjectURL(audioBlob);

    tempAudio.onloadedmetadata = () => {
      URL.revokeObjectURL(tempAudio.src);
      resolve(tempAudio.duration);
    };

    tempAudio.onerror = (err) => {
      URL.revokeObjectURL(tempAudio.src);
      reject(err);
    };
  });
}

/**
 * Fetches audio input devices using the `navigator.mediaDevices.enumerateDevices` API.
 * @returns {Promise<Object[]>} - Promise that resolves to an array of audio input devices.
 */
function getAudioInputDevices() {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        // Filter the devices to include only audio input devices
        const audioInputDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );
        console.log(
          "Offscreen: Found audio input devices:",
          audioInputDevices.length
        );
        resolve(audioInputDevices);
      })
      .catch((error) => {
        console.log("Error getting audio input devices", error);
        reject(error);
      });
  });
}

/**
 * Checks microphone permissions using the `navigator.permissions.query` API.
 * @returns {Promise<Object>} - Promise that resolves to an object containing permission status.
 */
function checkAudioPermissions() {
  return new Promise((resolve, reject) => {
    // First try permissions API
    navigator.permissions
      .query({ name: "microphone" })
      .then((result) => {
        console.log("Offscreen: Permissions API result:", result.state);

        // If permission is already denied, we can return early
        if (result.state === "denied") {
          console.log("Offscreen: Microphone permissions explicitly denied");
          reject({
            message: { status: "error", data: "denied" },
          });
          return;
        }

        // Even if permissions API says "granted", actually try to use the microphone
        // This is more reliable and will trigger the permission prompt if needed
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            // Successfully got access to microphone
            console.log("Offscreen: Successfully accessed microphone");

            // Stop all tracks to release microphone
            stream.getTracks().forEach((track) => track.stop());

            resolve({ message: { status: "success" } });
          })
          .catch((mediaError) => {
            console.error("Offscreen: Error accessing microphone:", mediaError);

            // Determine the type of error
            let errorState = "denied";
            if (mediaError.name === "NotAllowedError") {
              // Permission was denied or dismissed
              errorState = mediaError.message.includes("dismissed")
                ? "prompt"
                : "denied";
            }

            reject({
              message: {
                status: "error",
                data: errorState,
                error: mediaError.toString(),
              },
            });
          });
      })
      .catch((error) => {
        console.warn("Offscreen: Permissions API error", error);
        reject({
          message: { status: "error", data: "error", error: error.toString() },
        });
      });
  });
}
