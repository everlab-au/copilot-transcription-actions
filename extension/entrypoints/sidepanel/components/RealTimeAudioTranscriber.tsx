import { useState, useEffect, useRef } from "react";
import { useTranscriber } from "../hooks/useTranscriber";
import useStore from "../utils/store";

// Define the sampling rate for audio processing
const SAMPLING_RATE = 16000;

// TypeScript declaration for browser API used in WXT
declare const browser: any;

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

  // Add refs for auto-transcription
  const transcriptionIntervalRef = useRef<number | null>(null);

  // Add state for auto-transcription settings
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [lastChunkTime, setLastChunkTime] = useState<number | null>(null);
  const [transcriptionCount, setTranscriptionCount] = useState(0);

  // Watch transcriber output and update the store
  useEffect(() => {
    if (transcriber.output) {
      // Update the global transcription state
      updateTranscription({
        text: transcriber.output.text,
        fullTranscript: transcriber.output.text,
      });
    }
  }, [transcriber.output, updateTranscription]);

  // Preload the Whisper model when component mounts
  useEffect(() => {
    // Just monitor the model status and update our local state accordingly
    const checkModelStatus = setInterval(() => {
      if (
        !transcriber.isModelLoading &&
        transcriber.progressItems.length === 0
      ) {
        clearInterval(checkModelStatus);
      } else if (
        transcriber.isModelLoading ||
        transcriber.progressItems.length > 0
      ) {
        // Show loading progress message with percentage if available
        if (transcriber.progressItems.length > 0) {
          const totalProgress =
            transcriber.progressItems.reduce(
              (sum, item) => sum + item.progress,
              0
            ) / transcriber.progressItems.length;

          const progressPercent = Math.round(totalProgress * 100);
        }
      }
    }, 1000);

    // Safety timeout to clear interval if loading takes too long
    setTimeout(() => {
      if (checkModelStatus) {
        clearInterval(checkModelStatus);
      }
    }, 30000); // 30 second max wait time - reduced from 60s

    // Clean up function
    return () => {
      clearInterval(checkModelStatus);
    };
  }, [transcriber.isModelLoading, transcriber.progressItems.length]);

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
          // Permissions API not available or error
        }
      }
    } catch (error) {
      // Error checking permission status
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
        // Direct request failed, try opening permission page
      }

      // If direct request fails, open the permission page
      await browser.runtime.sendMessage({ action: "openPermissionPage" });
      setRecordingStatus("Please grant microphone permission in the new tab.");
    } catch (error) {
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
      audioContextRef.current.close().catch(() => {
        // Ignore errors when closing audio context
      });
      audioContextRef.current = null;
    }
  };

  // Add a function to check if transcription is actually possible
  const canTranscribe = (): boolean => {
    // Check various conditions that might prevent transcription
    if (transcriber.isModelLoading) {
      setTranscriptionStatus(
        "Cannot transcribe yet - Whisper model is still loading"
      );
      return false;
    }

    if (transcriber.isBusy) {
      return false;
    }

    if (transcriber.progressItems.length > 0) {
      setTranscriptionStatus(
        "Cannot transcribe yet - Model files are still downloading"
      );
      return false;
    }

    return true;
  };

  // Process audio data directly for transcription
  const processAudioChunkDirectly = async (audioData: Float32Array) => {
    if (isProcessingAudioRef.current) {
      return;
    }

    // Check if transcription is possible
    if (!canTranscribe()) {
      return;
    }

    try {
      isProcessingAudioRef.current = true;
      setTranscriptionStatus("Processing 5-second audio chunk...");

      setLastChunkTime(Date.now());

      // Create a context if not already created
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
        });
      }

      // Create an audio buffer from the raw audio data
      const buffer = audioContextRef.current.createBuffer(
        1, // mono
        audioData.length,
        SAMPLING_RATE
      );

      // Copy the audio data to the buffer
      buffer.copyToChannel(audioData, 0);

      // Process with Whisper
      await transcriber.start(buffer);
      setTranscriptionCount((prev) => prev + 1);
    } catch (error) {
      setTranscriptionStatus(`Transcription error: ${error}`);
    } finally {
      isProcessingAudioRef.current = false;
    }
  };

  // Add simple audio recorder implementation that bypasses MediaRecorder
  // and works directly with audio data for more reliable transcription
  const setupDirectAudioCapture = (stream: MediaStream) => {
    try {
      // Create audio context with correct sample rate
      const audioContext = new AudioContext({
        sampleRate: SAMPLING_RATE,
      });
      audioContextRef.current = audioContext;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessor for direct audio processing (more reliable for our use case)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      // Set up buffer for collecting audio data
      const bufferSize = Math.floor(SAMPLING_RATE * 5); // 5 seconds of audio
      let audioBuffer = new Float32Array(bufferSize);
      let audioPosition = 0;
      let startTime = Date.now();

      // Process audio data in real-time
      processor.onaudioprocess = (e) => {
        if (!isRecording || !autoTranscribe) return;

        // Get audio data
        const inputData = e.inputBuffer.getChannelData(0);

        // Add to our buffer
        for (let i = 0; i < inputData.length; i++) {
          if (audioPosition < bufferSize) {
            audioBuffer[audioPosition++] = inputData[i];
          }
        }

        // Check if we have 5 seconds of audio data
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= 5) {
          // Create a copy of the data we've collected so far
          const audioToProcess = audioBuffer.slice(0, audioPosition);

          // Reset buffer and timer
          audioBuffer = new Float32Array(bufferSize);
          audioPosition = 0;
          startTime = Date.now();

          // Process this chunk
          processAudioChunkDirectly(audioToProcess);
        }
      };

      // Connect the processor
      source.connect(processor);
      processor.connect(audioContext.destination);

      // Return disconnect function for cleanup
      return () => {
        processor.disconnect();
        source.disconnect();
      };
    } catch (error) {
      setRecordingStatus(`Error setting up audio capture: ${error}`);
      return () => {};
    }
  };

  // Modify the startRecording function
  const startRecording = async () => {
    try {
      if (permissionStatus !== "granted") {
        requestMicrophonePermission();
        return;
      }

      setRecordingStatus("Starting recording...");
      setTranscriptionCount(0);
      setLastChunkTime(null);

      // Reset audio buffers
      audioBufferRef.current = [];
      isProcessingAudioRef.current = false;

      // Get microphone stream with high-quality settings
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLING_RATE, // Request specific sample rate
        },
      });

      streamRef.current = micStream;

      // Set up direct audio capture for real-time transcription
      const cleanup = setupDirectAudioCapture(micStream);

      // Start tab audio capture via background script
      const tabCaptureResponse = await browser.runtime.sendMessage({
        action: "startRecording",
      });

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

      // Create a media recorder for saving the recording
      const mimeType = getSupportedMimeType();

      const options = { mimeType };
      const mediaRecorder = new MediaRecorder(micStream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Set up event handler to save chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Set up stop handler to save the recording
      mediaRecorder.onstop = async () => {
        // Clean up the direct audio capture
        cleanup();

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
      mediaRecorder.start(1000); // Collect data every 1 second for saving

      setIsRecording(true);
      setIsTranscribing(autoTranscribe);
      startTimer();
    } catch (error) {
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

        // Clear transcription interval if it exists
        if (transcriptionIntervalRef.current) {
          clearInterval(transcriptionIntervalRef.current);
          transcriptionIntervalRef.current = null;
        }

        // Notify the background script to stop tab audio capture
        await browser.runtime.sendMessage({ action: "stopRecording" });
      } else {
        setRecordingStatus("No active recording found");
      }
    } catch (error) {
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

    // Check if transcription is possible
    if (!canTranscribe()) {
      return;
    }

    try {
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
      const audioBuffer = await audioContextRef.current.decodeAudioData(
        arrayBuffer
      );

      // Process with Whisper
      await transcriber.start(audioBuffer);
    } catch (error) {
      setTranscriptionStatus(`Transcription error: ${error}`);
    }
  };

  return (
    <div className="flex flex-col space-y-4 p-4 max-w-full h-full text-gray-800 font-sans overflow-y-auto">
      {/* Whisper Model Status */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Whisper Model</h3>
          <div>
            {transcriber.isModelLoading ||
            transcriber.progressItems.length > 0 ? (
              <span className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                Loading
              </span>
            ) : (
              <span className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                Ready
              </span>
            )}
          </div>
        </div>

        {transcriber.isModelLoading || transcriber.progressItems.length > 0 ? (
          <div className="mt-1">
            {/* Simplified unified progress bar */}
            <div className="w-full">
              {(() => {
                let progressPercent = 0;

                if (transcriber.progressItems.length > 0) {
                  const totalProgress =
                    transcriber.progressItems.reduce(
                      (sum, item) => sum + item.progress,
                      0
                    ) / transcriber.progressItems.length;

                  progressPercent = Math.round(totalProgress * 100);
                }

                return (
                  <>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="font-medium text-gray-700">
                        {progressPercent / 100 || 0}%
                      </span>
                      {transcriber.progressItems.length > 0 &&
                        progressPercent > 0 && (
                          <span className="text-gray-600">{100}%</span>
                        )}
                    </div>
                    <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`bg-blue-500 h-full transition-all duration-300 ${
                          transcriber.progressItems.length === 0
                            ? "animate-pulse w-1/4"
                            : ""
                        }`}
                        style={
                          transcriber.progressItems.length > 0
                            ? { width: `${progressPercent / 100}%` }
                            : {}
                        }
                      ></div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="text-xs text-gray-500 mt-2">
              {transcriber.progressItems.length > 0
                ? "Downloading model files. This only happens once."
                : "Initializing transcription engine. Please wait..."}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            Ready for audio transcription. You can start recording.
          </div>
        )}
      </div>

      {/* Microphone Permission Status */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Microphone</h3>
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-2 ${
                permissionStatus === "granted"
                  ? "bg-green-500"
                  : permissionStatus === "denied"
                  ? "bg-red-500"
                  : "bg-yellow-500"
              }`}
            ></div>
            <span className="text-sm">
              {permissionStatus === "granted"
                ? "Access Granted"
                : permissionStatus === "denied"
                ? "Access Denied"
                : "Permission Required"}
            </span>
          </div>
        </div>

        <div className="flex justify-center">
          {permissionStatus !== "granted" && (
            <button
              onClick={requestMicrophonePermission}
              className="flex items-center justify-center px-6 py-3 mt-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Request Microphone Permission
            </button>
          )}
        </div>
      </div>

      {/* Auto-transcribe checkbox and Recording Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Recording</h3>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoTranscribe}
              onChange={() => setAutoTranscribe(!autoTranscribe)}
              className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-gray-700 font-medium">
              Auto-transcribe
            </span>
          </label>
        </div>

        <div className="flex justify-center">
          {!isRecording ? (
            <div className="flex gap-2">
              <button
                onClick={startRecording}
                disabled={
                  permissionStatus !== "granted" || transcriber.isModelLoading
                }
                className={`flex items-center justify-center px-6 py-3 rounded-md font-medium text-white ${
                  permissionStatus !== "granted" || transcriber.isModelLoading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <circle cx="10" cy="10" r="8" />
                </svg>
                {transcriber.isModelLoading
                  ? "Model is loading..."
                  : "Start Recording"}
              </button>
              {audioUrl && (
                <button
                  onClick={transcribeLastRecording}
                  disabled={
                    permissionStatus !== "granted" || transcriber.isModelLoading
                  }
                  className={`flex items-center justify-center px-6 py-3 rounded-md font-medium text-white ${
                    permissionStatus !== "granted" || transcriber.isModelLoading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Transcribe Last Recording
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center justify-center px-6 py-3 rounded-md font-medium text-white bg-red-600 hover:bg-red-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <rect x="5" y="5" width="10" height="10" />
              </svg>
              Stop Recording
            </button>
          )}
        </div>

        {isRecording && (
          <div className="mt-4 flex items-center justify-center text-sm font-medium">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2"></div>
              <span>Recording: {formatTime(recordingTime)}</span>
            </div>

            {recordingSource && (
              <span className="ml-4 px-2 py-1 bg-gray-100 rounded-full text-xs">
                Source:{" "}
                {recordingSource === "both" ? "Mic + Tab" : recordingSource}
              </span>
            )}

            {isTranscribing && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                Transcribing: {autoTranscribe ? "Auto" : "Manual"}
              </span>
            )}
          </div>
        )}

        {recordingStatus && (
          <div className="mt-3 text-sm text-gray-600 text-center">
            {recordingStatus}
          </div>
        )}
      </div>

      {/* Transcript Display */}
      <div className="bg-white rounded-lg shadow p-4 flex-grow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium">Live Transcript</h3>

          {transcriber.output?.text && (
            <button
              onClick={() =>
                navigator.clipboard.writeText(transcriber.output?.text || "")
              }
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Copy
            </button>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto bg-gray-50">
          {transcriber.output?.text ? (
            <p className="whitespace-pre-wrap text-gray-800">
              {transcriber.output.text}
            </p>
          ) : (
            <p className="text-gray-500 italic">
              {transcriber.isModelLoading
                ? "Waiting for model to load..."
                : isRecording && autoTranscribe
                ? "Listening for speech to transcribe..."
                : "Start recording to see transcription here"}
            </p>
          )}
        </div>

        {transcriptionStatus && (
          <div
            className={`mt-2 p-2 text-sm rounded-md ${
              transcriptionStatus.includes("Detected scheduling")
                ? "bg-amber-50 text-amber-800"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {transcriptionStatus}
          </div>
        )}
      </div>

      {/* Previous Recording (if available) */}
      {audioUrl && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-medium mb-3">Previous Recording</h3>
          <audio
            controls
            src={audioUrl}
            className="w-full mb-3 rounded"
          ></audio>
          <div className="flex space-x-3">
            <button
              onClick={transcribeLastRecording}
              disabled={transcriber.isModelLoading || transcriber.isBusy}
              className={`text-sm px-4 py-2 rounded-md font-medium ${
                transcriber.isModelLoading || transcriber.isBusy
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
            >
              Transcribe This Recording
            </button>
            <a
              href={audioUrl}
              download={`recording-${Date.now()}.webm`}
              className="text-sm px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-md font-medium"
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default RealTimeAudioTranscriber;
