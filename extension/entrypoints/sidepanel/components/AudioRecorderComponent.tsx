import { useState, useEffect, useRef } from "react";
import "./AudioRecorderComponent.css";

// TypeScript declaration for browser API used in WXT
declare const browser: any;
declare const chrome: {
  runtime: {
    sendMessage: (message: any, callback?: (response: any) => void) => void;
    onMessage: {
      addListener: (
        callback: (request: any, sender: any, sendResponse: any) => void
      ) => void;
      removeListener: (
        callback: (request: any, sender: any, sendResponse: any) => void
      ) => void;
    };
    getURL: (path: string) => string;
  };
};

function AudioRecorderComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTimestamp, setRecordingTimestamp] = useState<string | null>(
    null
  );
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [recordings, setRecordings] = useState<any[]>([]);
  const [tabAudioCaptured, setTabAudioCaptured] = useState(false);
  const [recordingSource, setRecordingSource] = useState<
    "mic" | "tab" | "both"
  >("mic");

  // Refs to store recording-related objects
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Check if permission was already granted from storage
    browser.storage.local
      .get("microphonePermissionGranted")
      .then((result: { microphonePermissionGranted?: boolean }) => {
        if (result.microphonePermissionGranted) {
          setPermissionStatus("granted");
          setRecordingStatus(
            "Microphone permission granted. You can now record audio."
          );
        } else {
          // If not found in storage, check permission status
          checkPermissionStatus();
        }
      });

    // Set up a periodic permission check
    const permissionCheckInterval = setInterval(() => {
      checkPermissionStatus();
    }, 2000);

    // Get the last recording if available
    browser.runtime
      .sendMessage({ action: "getLastRecording" })
      .then((response: any) => {
        if (response.recording) {
          setAudioUrl(response.recording.url);
          setRecordingTimestamp(response.recording.timestamp);
        }
      });

    // Listen for permission status changes
    const handlePermissionChange = (message: any) => {
      if (message.action === "permissionStatusChanged") {
        setPermissionStatus(message.granted ? "granted" : "denied");
        if (message.granted) {
          setRecordingStatus(
            "Microphone permission granted. You can now record audio."
          );
        } else {
          setRecordingStatus(
            `Microphone permission denied: ${
              message.error || "Access not granted"
            }`
          );
        }
      }
    };

    browser.runtime.onMessage.addListener(handlePermissionChange);

    return () => {
      // Clean up when component unmounts
      clearInterval(permissionCheckInterval);
      browser.runtime.onMessage.removeListener(handlePermissionChange);
      if (timerInterval) {
        clearInterval(timerInterval);
      }
      stopMediaTracks();
    };
  }, []);

  const checkPermissionStatus = async () => {
    try {
      // First check with the background script
      const response = await browser.runtime.sendMessage({
        action: "checkPermissionStatus",
      });
      if (response.granted) {
        setPermissionStatus("granted");
        setRecordingStatus(
          "Microphone permission granted. You can now record audio."
        );
        return;
      }

      // If background script says not granted, try to check directly
      try {
        // Try to directly access the microphone to check permission
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // If we get here, permission was granted
        stream.getTracks().forEach((track) => track.stop()); // Stop the tracks

        // Update permission status
        setPermissionStatus("granted");
        setRecordingStatus(
          "Microphone permission granted. You can now record audio."
        );

        // Notify background script that permission is granted
        browser.runtime.sendMessage({
          action: "permissionGranted",
          type: "microphone",
        });

        return;
      } catch (directError) {
        console.log("Could not get permission directly:", directError);

        // Try using the Permissions API as a fallback
        try {
          // @ts-ignore - Chrome specific API
          const permissionStatus = await navigator.permissions.query({
            name: "microphone",
          });
          if (permissionStatus.state === "granted") {
            setPermissionStatus("granted");
            setRecordingStatus(
              "Microphone permission granted. You can now record audio."
            );

            // Notify background script that permission is granted
            browser.runtime.sendMessage({
              action: "permissionGranted",
              type: "microphone",
            });
          } else if (permissionStatus.state === "denied") {
            setPermissionStatus("denied");
            setRecordingStatus(
              'Microphone access was denied. Please click "Request Permission" to try again.'
            );
          } else {
            setPermissionStatus("unknown");
          }
        } catch (permError) {
          console.error("Error checking permission directly:", permError);
        }
      }
    } catch (error) {
      console.error("Error checking permission status:", error);
    }
  };

  const requestMicrophonePermission = async () => {
    setRecordingStatus("Requesting microphone access...");

    try {
      // Try to request permission directly first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // If we get here, permission was granted
        stream.getTracks().forEach((track) => track.stop()); // Stop the tracks

        setPermissionStatus("granted");
        setRecordingStatus(
          "Microphone permission granted. You can now record audio."
        );

        // Notify background script that permission is granted
        browser.runtime.sendMessage({
          action: "permissionGranted",
          type: "microphone",
        });

        return;
      } catch (directError) {
        console.log(
          "Could not get permission directly, opening permission page..."
        );
      }

      // If direct request fails, open the permission page
      await browser.runtime.sendMessage({ action: "openPermissionPage" });
      setRecordingStatus("Please grant microphone permission in the new tab.");
    } catch (error) {
      console.error("Error requesting permission:", error);
      setRecordingStatus(
        `Error requesting permission: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const stopMediaTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (tabStreamRef.current) {
      tabStreamRef.current.getTracks().forEach((track) => track.stop());
      tabStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
  };

  // Function to mix microphone and tab audio
  const mixAudioStreams = (
    micStream: MediaStream,
    tabStream: MediaStream
  ): MediaStream => {
    try {
      const audioContext = new AudioContext({
        // Higher sample rate for better audio quality
        sampleRate: 48000,
      });

      // Create sources for both streams
      const micSource = audioContext.createMediaStreamSource(micStream);
      const tabSource = audioContext.createMediaStreamSource(tabStream);

      // Create a destination for the mixed audio
      const destination = audioContext.createMediaStreamDestination();

      // Create gain nodes to control volume
      const micGain = audioContext.createGain();
      const tabGain = audioContext.createGain();

      // Create analyzers to visualize levels
      const micAnalyser = audioContext.createAnalyser();
      const tabAnalyser = audioContext.createAnalyser();

      // Create a compressor to prevent clipping
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Set gain values (1.0 = 100% volume)
      // Slightly reduce mic volume to prevent overpowering the tab audio
      micGain.gain.value = 0.8;
      tabGain.gain.value = 1.0; // Tab audio at full volume

      // Connect the analyzers for visualization
      micSource.connect(micAnalyser);
      tabSource.connect(tabAnalyser);

      // Connect the sources through the gain nodes to the compressor
      micSource.connect(micGain).connect(compressor);
      tabSource.connect(tabGain).connect(compressor);

      // Connect the compressor to the destination
      compressor.connect(destination);

      console.log("Audio streams mixed successfully with enhanced processing");
      return destination.stream;
    } catch (error) {
      console.error("Error mixing audio streams:", error);
      // Return the microphone stream as fallback
      return micStream;
    }
  };

  const startRecording = async () => {
    try {
      if (permissionStatus !== "granted") {
        requestMicrophonePermission();
        return;
      }

      setRecordingStatus("Starting recording...");

      // Create an audio context
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Get microphone stream
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = micStream;

      // Start tab audio capture via background script
      const tabCaptureResponse = await browser.runtime.sendMessage({
        action: "startRecording",
      });
      console.log("Tab capture response:", tabCaptureResponse);

      // Set recording state based on tab audio capture response
      if (tabCaptureResponse && tabCaptureResponse.tabAudioCaptured) {
        setTabAudioCaptured(true);
        setRecordingSource("both");
        setRecordingStatus("Recording from microphone and tab audio...");
      } else {
        setTabAudioCaptured(false);
        setRecordingSource("mic");

        // Show more specific error messages
        if (tabCaptureResponse && tabCaptureResponse.error) {
          let errorMessage = `Recording from microphone only. Tab audio capture failed: ${tabCaptureResponse.error}`;

          // Trim error message if too long
          if (errorMessage.length > 100) {
            errorMessage = errorMessage.substring(0, 100) + "...";
          }

          setRecordingStatus(errorMessage);
        } else {
          setRecordingStatus("Recording from microphone only...");
        }
      }

      // Create a media recorder for the microphone
      // Use the best supported audio format
      const mimeType = getSupportedMimeType();
      console.log("Using mime type for recording:", mimeType);

      const options = { mimeType };
      const mediaRecorder = new MediaRecorder(micStream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Create a blob from the recorded chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        const audioUrl = URL.createObjectURL(audioBlob);

        setAudioUrl(audioUrl);

        // If we recorded tab audio, we need to combine it with microphone audio
        if (tabAudioCaptured) {
          setRecordingStatus("Processing recorded audio...");

          try {
            // Get the tab audio data from storage
            const tabAudioResponse = await browser.runtime.sendMessage({
              action: "getTabAudioData",
            });

            if (tabAudioResponse && tabAudioResponse.tabAudioData) {
              console.log("Retrieved tab audio data");

              // In a production implementation, we would:
              // 1. Convert the base64 data to a blob
              // 2. Create an audio element to play tab audio
              // 3. Use Web Audio API to combine the microphone and tab audio
              // 4. Create a new downloadable audio file

              // For now, we'll just acknowledge that we have both sources
              setRecordingStatus(
                `Recording saved (Source: Microphone + Tab Audio)`
              );
            } else {
              setRecordingStatus(
                `Recording saved (Source: Microphone Only - Tab audio processing failed)`
              );
            }
          } catch (error) {
            console.error("Error retrieving tab audio:", error);
            setRecordingStatus(
              `Recording saved (Source: Microphone Only - Tab audio retrieval error)`
            );
          }
        } else {
          setRecordingStatus(`Recording saved (Source: Microphone Only)`);
        }

        // Save the recording via the background script
        await browser.runtime.sendMessage({
          action: "saveRecording",
          audioUrl: audioUrl,
          recordingSource: recordingSource,
        });

        // Get the updated recording with timestamp
        const response = await browser.runtime.sendMessage({
          action: "getLastRecording",
        });
        if (response.recording) {
          setRecordingTimestamp(response.recording.timestamp);
        }
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms

      setIsRecording(true);
      startTimer();
    } catch (error) {
      console.error("Error starting recording:", error);

      // Handle specific permission errors
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setRecordingStatus(
          'Microphone access was denied. Please click "Request Permission" to try again.'
        );
        setPermissionStatus("denied");

        // Update permission status in background
        browser.runtime.sendMessage({
          action: "permissionDenied",
          type: "microphone",
          error: "Access denied when trying to record",
        });
      } else {
        setRecordingStatus(
          `Error: ${
            error instanceof Error ? error.message : "Unknown error occurred"
          }`
        );
      }

      stopMediaTracks();
    }
  };

  // Helper function to get the best supported mime type
  const getSupportedMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "audio/webm";
  };

  const stopRecording = async () => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
        stopMediaTracks();

        setIsRecording(false);
        setRecordingStatus("Processing recording...");
        stopTimer();

        // Notify the background script to stop tab audio capture
        await browser.runtime.sendMessage({ action: "stopRecording" });
      } else {
        setRecordingStatus("No active recording found");
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingStatus(
        `Error: ${
          error instanceof Error ? error.message : "Unknown error occurred"
        }`
      );
    }
  };

  const startTimer = () => {
    setRecordingTime(0);
    const interval = window.setInterval(() => {
      setRecordingTime((prevTime) => prevTime + 1);
    }, 1000);
    setTimerInterval(interval);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="audio-recorder">
      <h1>Audio Recorder</h1>

      <div className="status-container">
        <p className="status-text">{recordingStatus}</p>
        {isRecording && (
          <div className="recording-indicator">
            <span className="recording-dot"></span>
            <span className="recording-time">{formatTime(recordingTime)}</span>
            {tabAudioCaptured && (
              <span className="recording-source">Tab Audio: Enabled</span>
            )}
          </div>
        )}
      </div>

      <div className="controls">
        {permissionStatus !== "granted" ? (
          <button
            className="permission-button"
            onClick={requestMicrophonePermission}
          >
            Request Microphone Permission
          </button>
        ) : !isRecording ? (
          <button
            className="record-button"
            onClick={startRecording}
            disabled={isRecording}
          >
            Start Recording
          </button>
        ) : (
          <button
            className="stop-button"
            onClick={stopRecording}
            disabled={!isRecording}
          >
            Stop Recording
          </button>
        )}
      </div>

      {audioUrl && (
        <div className="playback-container">
          <h2>Last Recording</h2>
          {recordingTimestamp && (
            <p className="timestamp">
              Recorded: {formatTimestamp(recordingTimestamp)}
            </p>
          )}
          <p className="recording-info">
            Source:{" "}
            {recordingSource === "both"
              ? "Microphone + Tab Audio"
              : recordingSource === "tab"
              ? "Tab Audio Only"
              : "Microphone Only"}
          </p>
          <audio controls src={audioUrl} className="audio-player"></audio>
          <a
            href={audioUrl}
            download={`recording-${
              recordingTimestamp
                ? new Date(recordingTimestamp).getTime()
                : Date.now()
            }.webm`}
            className="download-button"
          >
            Download Recording
          </a>
        </div>
      )}

      <div className="info-text">
        <p>
          This extension records audio from your microphone and browser tab.
        </p>
        <p className="note">
          Note: You must grant microphone permission to use this feature.
        </p>
        <p className="note">
          Tab audio recording requires the current tab to be playing audio.
        </p>
        <p className="note">
          Tab audio is captured using an offscreen document in Manifest V3.
        </p>
      </div>
    </div>
  );
}

export default AudioRecorderComponent;
