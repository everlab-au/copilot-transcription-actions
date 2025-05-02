import { useState, useEffect, useRef } from "react";
import useStore from "../utils/store";
import { useTranscriber } from "../hooks/useTranscriber";
import {
  requestMicrophonePermission,
  checkMicrophonePermission,
} from "../utils/permissionUtils";
import { SAMPLING_RATE } from "../utils/constants";

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

// Permission status type
type PermissionStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "prompt"
  | "checking";

export default function AudioTranscriber() {
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [fullTranscription, setFullTranscription] = useState("");
  const [isLiveTranscribing, setIsLiveTranscribing] = useState(false);

  // Audio context for processing
  const audioContextRef = useRef<AudioContext | null>(null);

  // Refs to store recording-related objects
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveAudioBufferRef = useRef<Float32Array>(new Float32Array());
  const processingLiveAudioRef = useRef<boolean>(false);

  // Timer for live transcription chunking
  const liveTranscriptionTimerRef = useRef<number | null>(null);

  // Get store actions
  const updateTranscription = useStore((state) => state.updateTranscription);

  // Initialize
  useEffect(() => {
    // Check permission status
    checkMicPermission();

    // Initialize audio context
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
          latencyHint: "interactive",
        });
      } catch (error) {
        console.error("Failed to initialize audio context:", error);
      }
    }

    // Set up a listener for messages from background
    const handleMessage = (request: any) => {
      if (request.message?.type === "RECORDING_COMPLETED") {
        console.log("AudioTranscriber: Received RECORDING_COMPLETED message");
        if (request.message.audioUrl) {
          setAudioUrl(request.message.audioUrl);

          // Auto-transcribe if requested
          if (request.message.autoTranscribe) {
            transcribeAudio(request.message.audioUrl);
          }
        }
      }

      if (request.message?.type === "RECORDING_STATUS") {
        if (request.message.status === "started") {
          setIsRecording(true);
          startTimer();
          setRecordingStatus("Recording in progress...");
        } else if (request.message.status === "stopped") {
          setIsRecording(false);
          stopTimer();
          setRecordingStatus("Recording stopped");

          // Get the last recording
          getLastRecording();
        }
      }

      if (request.message?.type === "AUDIO_DATA") {
        if (isLiveTranscribing && request.message.data) {
          // Process audio data for live transcription
          processLiveAudioData(request.message.data);
        }
      }
    };

    // Add message listener
    chrome.runtime.onMessage.addListener(handleMessage);

    // Get last recording
    getLastRecording();

    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      stopTimer();
      stopLiveTranscription();

      if (audioContextRef.current) {
        if (audioProcessorRef.current) {
          audioProcessorRef.current.disconnect();
        }
        audioContextRef.current.close().catch(console.error);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Process live audio data from the microphone
  const processLiveAudioData = async (audioData: ArrayBuffer) => {
    if (processingLiveAudioRef.current) {
      console.log("Already processing audio, skipping chunk");
      return;
    }

    try {
      processingLiveAudioRef.current = true;
      console.log("Processing live audio chunk of size:", audioData.byteLength);

      if (!audioContextRef.current) {
        console.error("Audio context not initialized");
        processingLiveAudioRef.current = false;
        return;
      }

      // Decode the audio data
      const audioBuffer = await audioContextRef.current.decodeAudioData(
        audioData
      );

      // Process with Whisper
      await transcriber.start(audioBuffer);

      // Reset processing flag
      processingLiveAudioRef.current = false;
    } catch (error) {
      console.error("Error processing live audio data:", error);
      processingLiveAudioRef.current = false;
    }
  };

  // Start live transcription
  const startLiveTranscription = () => {
    setIsLiveTranscribing(true);
    setTranscriptionStatus("Live transcription enabled");
  };

  // Stop live transcription
  const stopLiveTranscription = () => {
    setIsLiveTranscribing(false);

    if (liveTranscriptionTimerRef.current) {
      clearInterval(liveTranscriptionTimerRef.current);
      liveTranscriptionTimerRef.current = null;
    }

    // Reset audio buffer
    liveAudioBufferRef.current = new Float32Array();
    processingLiveAudioRef.current = false;
  };

  // Handle transcriber output updates
  useEffect(() => {
    if (transcriber.output?.text) {
      const text = transcriber.output.text;
      console.log("AudioTranscriber: New transcription:", text);

      // Update state
      setFullTranscription(text);

      // Update store
      updateTranscription({
        text,
        fullTranscript: text,
      });

      // Update status
      if (isTranscribing) {
        setTranscriptionStatus("Transcription complete");
        setIsTranscribing(false);
      } else if (isLiveTranscribing) {
        setTranscriptionStatus("Live transcription active");
      }
    }
  }, [transcriber.output?.text, isTranscribing, updateTranscription]);

  // Check microphone permission
  const checkMicPermission = async () => {
    try {
      setPermissionStatus("checking");

      // Check directly
      const isGranted = await checkMicrophonePermission();
      if (isGranted) {
        setPermissionStatus("granted");
        return;
      }

      // Check via background script
      const response = await browser.runtime.sendMessage({
        action: "checkPermissionStatus",
      });

      if (response && response.granted) {
        setPermissionStatus("granted");
      } else {
        setPermissionStatus("denied");
      }
    } catch (error) {
      console.error("Error checking permission:", error);
      setPermissionStatus("unknown");
    }
  };

  // Request microphone permission
  const requestMicPermission = async () => {
    try {
      setPermissionStatus("checking");
      setRecordingStatus("Requesting microphone permission...");

      // Request with iframe
      await requestMicrophonePermission();

      // Update status
      setPermissionStatus("granted");
      setRecordingStatus("Microphone permission granted");

      // Notify background script
      await browser.runtime.sendMessage({
        action: "permissionGranted",
      });
    } catch (error) {
      console.error("Error requesting permission:", error);
      setPermissionStatus("denied");
      setRecordingStatus(`Permission denied: ${error}`);

      // Notify background script
      await browser.runtime.sendMessage({
        action: "permissionDenied",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      let currentPermissionStatus = permissionStatus;

      if (currentPermissionStatus !== "granted") {
        await requestMicPermission();

        // Check if permission was granted via direct check
        const isGranted = await checkMicrophonePermission();
        if (isGranted) {
          currentPermissionStatus = "granted";
          setPermissionStatus("granted");
        } else {
          // If still not granted, we can't proceed
          console.log("Permission not granted after request, cannot record");
          return;
        }
      }

      setRecordingStatus("Starting recording...");

      // Enable live transcription
      startLiveTranscription();

      // Send message to background script to start recording
      const response = await browser.runtime.sendMessage({
        message: {
          type: "TOGGLE_RECORDING",
          data: "START",
        },
      });

      if (response && response.success) {
        setIsRecording(true);
        startTimer();
        setRecordingStatus("Recording and transcribing live...");
      } else {
        stopLiveTranscription();
        setRecordingStatus(
          `Error starting recording: ${response?.error || "Unknown error"}`
        );
      }
    } catch (error) {
      console.error("Error starting recording:", error);
      setRecordingStatus(`Error starting recording: ${error}`);
      stopLiveTranscription();
    }
  };

  // Stop recording
  const stopRecording = async () => {
    try {
      setRecordingStatus("Stopping recording...");

      // Stop live transcription
      stopLiveTranscription();

      // Send message to background script to stop recording
      const response = await browser.runtime.sendMessage({
        message: {
          type: "TOGGLE_RECORDING",
          data: "STOP",
        },
      });

      if (response && response.success) {
        setIsRecording(false);
        stopTimer();
        setRecordingStatus("Recording stopped");

        // Get the last recording
        getLastRecording();
      } else {
        setRecordingStatus(
          `Error stopping recording: ${response?.error || "Unknown error"}`
        );
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingStatus(`Error stopping recording: ${error}`);
    }
  };

  // Transcribe audio from URL
  const transcribeAudio = async (url: string) => {
    try {
      setIsTranscribing(true);
      setTranscriptionStatus("Transcribing audio...");

      // Fetch audio data
      const response = await fetch(url);
      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
          latencyHint: "interactive",
        });
      }

      // Decode audio
      const audioBuffer = await audioContextRef.current.decodeAudioData(
        arrayBuffer
      );

      // Start transcription
      await transcriber.start(audioBuffer);

      // Success is handled in the useEffect for transcriber.output
    } catch (error) {
      console.error("Error transcribing audio:", error);
      setTranscriptionStatus(`Error transcribing audio: ${error}`);
      setIsTranscribing(false);
    }
  };

  // Get last recording
  const getLastRecording = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        action: "getLastRecording",
      });

      if (response && response.recording) {
        setAudioUrl(response.recording.url);
        setRecordingTimestamp(response.recording.timestamp);
        setRecordingSource(response.recording.source || "mic");
      }
    } catch (error) {
      console.error("Error getting last recording:", error);
    }
  };

  // Timer functions
  const startTimer = () => {
    setRecordingTime(0);
    const interval = window.setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
    setTimerInterval(interval);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
  };

  // Format helpers
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Get permission indicator color
  const getPermissionColor = () => {
    switch (permissionStatus) {
      case "granted":
        return "bg-green-500";
      case "denied":
        return "bg-red-500";
      case "prompt":
        return "bg-yellow-500";
      case "checking":
        return "bg-blue-500 animate-pulse";
      default:
        return "bg-gray-500";
    }
  };

  // Render
  return (
    <div className="audio-transcriber p-4">
      <h2 className="text-lg font-semibold mb-4">
        Audio Recorder & Live Transcriber
      </h2>

      {/* Permission status */}
      <div className="flex items-center mb-4">
        <div
          className={`w-2 h-2 rounded-full mr-2 ${getPermissionColor()}`}
        ></div>
        <span className="text-sm">
          {permissionStatus === "granted"
            ? "Microphone access granted"
            : permissionStatus === "denied"
            ? "Microphone access denied"
            : permissionStatus === "checking"
            ? "Checking microphone permission..."
            : "Microphone permission required"}
        </span>

        {permissionStatus !== "granted" && (
          <button
            className="ml-2 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={requestMicPermission}
          >
            Request Permission
          </button>
        )}
      </div>

      {/* Status message */}
      {recordingStatus && (
        <div className="text-sm mb-4 text-gray-600">{recordingStatus}</div>
      )}

      {/* Recording controls */}
      <div className="mb-4">
        <button
          className={`px-4 py-2 rounded-full ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={
            permissionStatus !== "granted" || transcriber.isModelLoading
          }
        >
          {isRecording ? "Stop Recording" : "Start Recording & Transcribe"}
        </button>

        {isRecording && (
          <div className="flex items-center mt-2">
            <div className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse"></div>
            <span className="text-sm">
              Recording: {formatTime(recordingTime)}
            </span>
            {isLiveTranscribing && (
              <span className="ml-2 text-xs px-1 py-0.5 bg-green-100 text-green-800 rounded">
                Live Transcription Active
              </span>
            )}
          </div>
        )}
      </div>

      {/* Transcription status */}
      {transcriptionStatus && (
        <div className="text-sm mb-4 text-gray-600">{transcriptionStatus}</div>
      )}

      {/* Whisper loading indicator */}
      {transcriber.isModelLoading && (
        <div className="my-4 text-center">
          <div className="flex justify-center items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full animate-bounce"></div>
            <div
              className="w-4 h-4 bg-blue-500 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
            <div
              className="w-4 h-4 bg-blue-500 rounded-full animate-bounce"
              style={{ animationDelay: "0.4s" }}
            ></div>
          </div>
          <p className="text-sm font-medium">Loading Whisper model...</p>
        </div>
      )}

      {/* Transcription output */}
      {fullTranscription && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Live Transcription</h3>
          <div className="p-3 bg-gray-100 rounded text-sm max-h-60 overflow-y-auto">
            {fullTranscription}
          </div>
        </div>
      )}

      {/* Audio playback */}
      {audioUrl && (
        <div className="mt-6 p-3 border rounded bg-gray-50">
          <h3 className="text-sm font-medium mb-2">Last Recording</h3>

          {recordingTimestamp && (
            <p className="text-xs text-gray-500 mb-2">
              Recorded: {formatTimestamp(recordingTimestamp)}
            </p>
          )}

          <audio controls src={audioUrl} className="w-full mb-2" />

          <div className="flex space-x-2">
            <button
              className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
              onClick={() => transcribeAudio(audioUrl)}
              disabled={isTranscribing}
            >
              {isTranscribing ? "Transcribing..." : "Transcribe Again"}
            </button>

            <a
              href={audioUrl}
              download={`recording-${
                recordingTimestamp
                  ? new Date(recordingTimestamp).getTime()
                  : Date.now()
              }.webm`}
              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
