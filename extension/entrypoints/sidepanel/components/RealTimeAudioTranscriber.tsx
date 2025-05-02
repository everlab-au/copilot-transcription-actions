import { useState, useEffect, useRef } from "react";
import { useTranscriber } from "../hooks/useTranscriber";
import useStore from "../utils/store";
import "./AudioRecorderComponent.css"; // Reuse the existing CSS

// Define the sampling rate for audio processing
const SAMPLING_RATE = 16000;

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

// Type for permission status
type PermissionStatus = "unknown" | "granted" | "denied";

function RealTimeAudioTranscriber() {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTimestamp, setRecordingTimestamp] = useState<string | null>(
    null
  );
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>("unknown");
  const [tabAudioCaptured, setTabAudioCaptured] = useState(false);
  const [recordingSource, setRecordingSource] = useState<
    "mic" | "tab" | "both"
  >("mic");

  // Transcription state
  const transcriber = useTranscriber();
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Debug state
  const [debugMode, setDebugMode] = useState(false);
  const [modelInfo, setModelInfo] = useState<string>("");

  // Get store functions
  const updateTranscription = useStore((state) => state.updateTranscription);

  // Refs to store recording-related objects
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);

  // For audio processing and transcription
  const audioBufferRef = useRef<Float32Array[]>([]);
  const isProcessingAudioRef = useRef<boolean>(false);
  const processingIntervalRef = useRef<number | null>(null);

  // Watch transcriber output and update the store
  useEffect(() => {
    if (transcriber.output) {
      console.log("Transcription output:", transcriber.output.text);

      // Update the global transcription state
      updateTranscription({
        text: transcriber.output.text,
        fullTranscript: transcriber.output.text,
      });

      // Check for scheduling keywords
      const hasSchedulingKeywords = checkForSchedulingKeywords(
        transcriber.output.text
      );

      // Update local status with highlighting if needed
      if (hasSchedulingKeywords) {
        setTranscriptionStatus(`Detected scheduling information!`);
      } else {
        // Truncate the text if it's too long
        const displayText =
          transcriber.output.text.length > 70
            ? transcriber.output.text.substring(0, 70) + "..."
            : transcriber.output.text;
        setTranscriptionStatus(`Transcribed: ${displayText}`);
      }
    }
  }, [transcriber.output, updateTranscription]);

  // Add logging for debugging
  useEffect(() => {
    console.log("Transcriber state:", {
      isBusy: transcriber.isBusy,
      isModelLoading: transcriber.isModelLoading,
      hasOutput: !!transcriber.output,
      processingAudio: isProcessingAudioRef.current,
    });
  }, [transcriber.isBusy, transcriber.isModelLoading, transcriber.output]);

  // Helper function to check for scheduling keywords
  const checkForSchedulingKeywords = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    return (
      (lowerText.includes("schedule") ||
        lowerText.includes("meeting") ||
        lowerText.includes("appointment")) &&
      (lowerText.includes("at ") ||
        lowerText.includes(" for ") ||
        lowerText.includes("o'clock") ||
        lowerText.includes("pm") ||
        lowerText.includes("am"))
    );
  };

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
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
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

  // Process audio data for transcription
  const processAudioForTranscription = async (audioBuffer: Float32Array) => {
    if (isProcessingAudioRef.current || !isRecording) {
      return;
    }

    try {
      isProcessingAudioRef.current = true;
      console.log("Starting transcription of audio chunk...");
      setTranscriptionStatus("Processing audio for transcription...");

      // Create a context if not already created
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
        });
      }

      // Create an audio buffer from the raw audio data
      const buffer = audioContextRef.current.createBuffer(
        1, // mono
        audioBuffer.length,
        SAMPLING_RATE
      );

      // Copy the audio data to the buffer
      buffer.copyToChannel(audioBuffer, 0);

      // Process with Whisper
      console.log("Processing audio chunk with Whisper...", {
        bufferLength: audioBuffer.length,
        isModelLoading: transcriber.isModelLoading,
        isBusy: transcriber.isBusy,
      });

      await transcriber.start(buffer);
      console.log("Transcription processing completed");

      // Clear the buffer after processing
      audioBufferRef.current = [];
    } catch (error) {
      console.error("Error processing audio for transcription:", error);
      setTranscriptionStatus(`Transcription error: ${error}`);
    } finally {
      isProcessingAudioRef.current = false;
    }
  };

  // Setup audio processing for real-time transcription
  const setupAudioProcessing = (stream: MediaStream) => {
    try {
      // Create audio context with correct sample rate
      const audioContext = new AudioContext({
        sampleRate: SAMPLING_RATE,
      });
      audioContextRef.current = audioContext;

      console.log(
        "Created audio context with sample rate:",
        audioContext.sampleRate
      );

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);

      // Use smaller buffer size for less latency, multiple of 256
      const bufferSize = 2048;

      // Create processor node for real-time processing
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      console.log("Created script processor with buffer size:", bufferSize);

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (!isRecording) return;

        // Get audio data
        const inputData = e.inputBuffer.getChannelData(0);

        // Clone the data
        const audioData = new Float32Array(inputData.length);
        audioData.set(inputData);

        // Add to buffer for processing
        audioBufferRef.current.push(audioData);
      };

      // Connect the nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log(
        "Audio processing setup complete, starting collection interval"
      );

      // Setup interval to process audio - shorter interval for more responsive transcription
      processingIntervalRef.current = window.setInterval(() => {
        if (
          audioBufferRef.current.length > 0 &&
          !isProcessingAudioRef.current
        ) {
          console.log(
            `Processing collected audio buffers: ${audioBufferRef.current.length} chunks`
          );

          // Combine all buffers
          const totalLength = audioBufferRef.current.reduce(
            (acc, buf) => acc + buf.length,
            0
          );

          console.log(`Combined buffer length: ${totalLength} samples`);

          // Only process if we have enough audio data (at least 1 second)
          if (totalLength >= SAMPLING_RATE) {
            const combinedBuffer = new Float32Array(totalLength);
            let offset = 0;

            for (const buffer of audioBufferRef.current) {
              combinedBuffer.set(buffer, offset);
              offset += buffer.length;
            }

            // Process the combined buffer
            processAudioForTranscription(combinedBuffer);
          } else {
            console.log(
              "Not enough audio data collected yet, waiting for more"
            );
          }
        }
      }, 2000); // Process every 2 seconds for more responsive feedback
    } catch (error) {
      console.error("Error setting up audio processing:", error);
      setRecordingStatus(`Error setting up audio processing: ${error}`);
    }
  };

  const startRecording = async () => {
    try {
      if (permissionStatus !== "granted") {
        requestMicrophonePermission();
        return;
      }

      setRecordingStatus("Starting recording...");
      setTranscriptionStatus("Initializing transcription...");

      // Reset audio buffers
      audioBufferRef.current = [];
      isProcessingAudioRef.current = false;

      // Get microphone stream
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = micStream;

      // Setup audio processing for transcription
      setupAudioProcessing(micStream);

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
        setRecordingStatus(
          `Recording saved (Source: ${
            recordingSource === "both"
              ? "Microphone + Tab Audio"
              : "Microphone Only"
          })`
        );

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
      setIsTranscribing(true);
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
        setIsTranscribing(false);
        setRecordingStatus("Processing recording...");
        stopTimer();

        // Stop audio processing
        if (processingIntervalRef.current) {
          clearInterval(processingIntervalRef.current);
          processingIntervalRef.current = null;
        }

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

  // Add a function to transcribe the last recording
  const transcribeLastRecording = async () => {
    if (!audioUrl) {
      setTranscriptionStatus("No recording available to transcribe");
      return;
    }

    try {
      setTranscriptionStatus("Transcribing the last recording...");
      console.log("Starting transcription of last recording:", audioUrl);

      // Fetch the audio data from the blob URL
      const response = await fetch(audioUrl);
      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Create or reuse audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
        });
      }

      // Decode the audio data
      console.log("Decoding audio data...");
      const audioBuffer = await audioContextRef.current.decodeAudioData(
        arrayBuffer
      );
      console.log("Audio decoded, duration:", audioBuffer.duration);

      // Process with Whisper
      console.log("Processing with Whisper...");
      await transcriber.start(audioBuffer);

      console.log("Transcription of recording completed");
    } catch (error) {
      console.error("Error transcribing recorded audio:", error);
      setTranscriptionStatus(`Transcription error: ${error}`);
    }
  };

  // Add a troubleshooting function to diagnose Whisper issues
  const troubleshootWhisper = async () => {
    try {
      setModelInfo("Checking Whisper model status...");

      // Log detailed info about transcriber state
      console.log("Detailed transcriber state:", {
        isBusy: transcriber.isBusy,
        isModelLoading: transcriber.isModelLoading,
        model: transcriber.model,
        multilingual: transcriber.multilingual,
        quantized: transcriber.quantized,
        hasOutput: !!transcriber.output,
        progressItems: transcriber.progressItems,
      });

      // Check WebWorker status
      if (transcriber.progressItems.length > 0) {
        const progress = transcriber.progressItems.map(
          (item) => `${item.file}: ${(item.progress * 100).toFixed(1)}%`
        );
        setModelInfo(`Model loading in progress: ${progress.join(", ")}`);
      } else if (transcriber.isModelLoading) {
        setModelInfo("Model is loading but no progress data available");
      } else if (transcriber.isBusy) {
        setModelInfo("Model is currently processing audio");
      } else {
        setModelInfo(
          "Model appears to be ready. If transcription isn't working, try reloading the page."
        );
      }

      // Try to force a model reload by changing settings
      if (!transcriber.isBusy && !transcriber.isModelLoading) {
        // Toggle quantized setting to force reload
        transcriber.setQuantized(!transcriber.quantized);
        setTimeout(() => {
          transcriber.setQuantized(!transcriber.quantized);
          setModelInfo((prev) => prev + "\nForced model reload attempted.");
        }, 500);
      }
    } catch (error) {
      console.error("Error troubleshooting Whisper:", error);
      setModelInfo(`Troubleshooting error: ${error}`);
    }
  };

  return (
    <div className="audio-recorder">
      <h1>Audio Recorder & Transcriber</h1>

      <div className="status-container">
        <p className="status-text">{recordingStatus}</p>
        {isRecording && (
          <div className="recording-indicator">
            <span className="recording-dot"></span>
            <span className="recording-time">{formatTime(recordingTime)}</span>
            {tabAudioCaptured && (
              <span className="recording-source">Tab Audio: Enabled</span>
            )}
            {isTranscribing && (
              <span
                className="recording-source"
                style={{ backgroundColor: "#ebf4ff", color: "#3182ce" }}
              >
                Transcribing: Active
              </span>
            )}
          </div>
        )}

        {transcriptionStatus && (
          <div
            className={`transcription-status ${
              transcriptionStatus.includes("Detected scheduling")
                ? "scheduling"
                : ""
            }`}
          >
            {transcriptionStatus.includes("Detected scheduling") ? (
              <div>
                <p style={{ fontWeight: "600" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "0.75rem",
                      height: "0.75rem",
                      backgroundColor: "#f59e0b",
                      borderRadius: "50%",
                      marginRight: "0.5rem",
                    }}
                  ></span>
                  {transcriptionStatus}
                </p>
                <p style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                  The system detected scheduling information and can create
                  calendar events.
                </p>
              </div>
            ) : (
              <p>{transcriptionStatus}</p>
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
            disabled={isRecording || transcriber.isModelLoading}
          >
            {transcriber.isModelLoading
              ? "Loading Whisper Model..."
              : "Start Recording & Transcribe"}
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

      {/* Whisper status and troubleshooting */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "1rem",
          fontSize: "0.8rem",
        }}
      >
        <label
          style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={debugMode}
            onChange={() => setDebugMode(!debugMode)}
            style={{ marginRight: "0.5rem" }}
          />
          Debug Mode
        </label>

        <button onClick={troubleshootWhisper} className="troubleshoot-button">
          Troubleshoot Transcription
        </button>
      </div>

      {/* Debug information */}
      {debugMode && (
        <div className="debug-info">
          <h3>Transcriber Status</h3>
          <ul>
            <li>Model: {transcriber.model}</li>
            <li>Model Loading: {transcriber.isModelLoading ? "Yes" : "No"}</li>
            <li>Processing: {transcriber.isBusy ? "Yes" : "No"}</li>
            <li>Multilingual: {transcriber.multilingual ? "Yes" : "No"}</li>
            <li>Quantized: {transcriber.quantized ? "Yes" : "No"}</li>
          </ul>
          {modelInfo && (
            <div className="model-info">
              <pre>{modelInfo}</pre>
            </div>
          )}
        </div>
      )}

      {/* Whisper model loading indicator */}
      {transcriber.isModelLoading && (
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            backgroundColor: "#ebf8ff",
            marginTop: "0.75rem",
            color: "#2b6cb0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                width: "0.75rem",
                height: "0.75rem",
                borderRadius: "50%",
                backgroundColor: "#3182ce",
                animation: "pulse 1.5s infinite",
              }}
            ></div>
            <span>Loading Whisper transcription model...</span>
          </div>
        </div>
      )}

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
          <div className="button-group">
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
            <button
              onClick={transcribeLastRecording}
              className="transcribe-button"
              disabled={transcriber.isModelLoading || transcriber.isBusy}
            >
              Transcribe This Recording
            </button>
          </div>
        </div>
      )}

      <div className="info-text">
        <p>
          This extension records and transcribes audio from your microphone and
          browser tab.
        </p>
        <p className="note">
          Note: You must grant microphone permission to use this feature.
        </p>
        <p className="note">
          Tab audio recording requires the current tab to be playing audio.
        </p>
        <p className="note">Real-time transcription is powered by Whisper.</p>
      </div>
    </div>
  );
}

export default RealTimeAudioTranscriber;
