import { useEffect, useRef, useState } from "react";
import { useTranscriber } from "../hooks/useTranscriber";
import { SAMPLING_RATE } from "../utils/constants";
import useStore from "../utils/store";
import {
  requestMicrophonePermission,
  checkMicrophonePermission,
} from "../utils/permissionUtils";
import PermissionTest from "./PermissionTest";

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

// The browser object is globally available in WXT

const CHUNK_INTERVAL_MS = 3000; // Process audio in 3-second chunks
const AUDIO_BUFFER_SIZE = SAMPLING_RATE * (CHUNK_INTERVAL_MS / 1000); // Buffer size for audio processing

// Permission status type
type PermissionStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "prompt"
  | "checking";

interface RealTimeTranscriberProps {
  onTranscriptionUpdate?: (transcription: string) => void;
}

export default function RealTimeTranscriber({
  onTranscriptionUpdate,
}: RealTimeTranscriberProps) {
  const transcriber = useTranscriber();

  // Reference for audio contexts and processors
  const audioContextRef = useRef<AudioContext | null>(null);

  // State for UI
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>("unknown");
  const [audioSources, setAudioSources] = useState<{
    hasMicrophone: boolean;
  }>({
    hasMicrophone: false,
  });
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isTranscribingRecording, setIsTranscribingRecording] =
    useState<boolean>(false);

  // Timer reference for recording duration
  const timerRef = useRef<number | null>(null);

  // Get store actions
  const updateTranscription = useStore((state) => state.updateTranscription);

  // Check microphone permission
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        setPermissionStatus("checking");
        console.log("RealTimeTranscriber: Checking microphone permission");

        // First try to check directly using our utility
        const isGranted = await checkMicrophonePermission();
        if (isGranted) {
          console.log("RealTimeTranscriber: Permission already granted");
          setPermissionStatus("granted");
          setAudioSources((prev) => ({ ...prev, hasMicrophone: true }));
          return;
        }

        // Fall back to offscreen check if direct check fails
        chrome.runtime.sendMessage(
          {
            message: {
              type: "CHECK_PERMISSIONS",
              target: "offscreen",
            },
          },
          (response) => {
            console.log(
              "RealTimeTranscriber: Permission check response:",
              response
            );

            if (response && response.message) {
              if (response.message.status === "success") {
                setPermissionStatus("granted");
                setAudioSources((prev) => ({ ...prev, hasMicrophone: true }));
              } else if (response.message.status === "error") {
                // If we get data.state, use that (prompted, denied, etc.)
                if (response.message.data === "prompt") {
                  setPermissionStatus("prompt");
                } else if (response.message.data === "denied") {
                  setPermissionStatus("denied");
                } else {
                  setPermissionStatus("denied");
                }
              }
            } else {
              setPermissionStatus("unknown");
            }
          }
        );
      } catch (error) {
        console.error(
          "RealTimeTranscriber: Error checking microphone permission:",
          error
        );
        setPermissionStatus("unknown");
      }
    };

    checkMicPermission();
  }, []);

  // Initialize audio context for processing incoming audio data
  useEffect(() => {
    const initAudioContext = () => {
      try {
        console.log("Initializing audio context...");
        const AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
          latencyHint: "interactive",
        });
        return audioContextRef.current;
      } catch (error) {
        console.error("Failed to initialize audio context:", error);
        setCaptureError(
          "Failed to initialize audio system. Please try reloading."
        );
        return null;
      }
    };

    initAudioContext();

    return () => {
      // Cleanup audio context when component unmounts
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Listen for audio data messages from the offscreen document
  useEffect(() => {
    console.log("Setting up message listener, isCapturing:", isCapturing);

    const handleMessages = (request: any) => {
      console.log("RealTimeTranscriber: Received message:", request);

      if (!request.message) {
        console.log("RealTimeTranscriber: Message has no message property");
        return;
      }

      switch (request.message.type) {
        case "AUDIO_DATA":
          console.log("RealTimeTranscriber: Received AUDIO_DATA");
          // Process incoming audio data
          if (isCapturing && request.message.data) {
            handleAudioData(request.message.data);
          }
          break;
        case "RECORDING_STATUS":
          console.log(
            "RealTimeTranscriber: Received RECORDING_STATUS:",
            request.message.status
          );
          if (request.message.status === "started") {
            console.log("RealTimeTranscriber: Recording started successfully");
            setStatusMessage("Recording audio...");
            setAudioSources((prev) => ({ ...prev, hasMicrophone: true }));
            setPermissionStatus("granted");

            // Start the recording duration timer
            setRecordingDuration(0);
            if (timerRef.current) {
              console.log("RealTimeTranscriber: Clearing existing timer");
              window.clearInterval(timerRef.current);
            }
            console.log("RealTimeTranscriber: Starting new timer");
            const timerId = window.setInterval(() => {
              console.log("RealTimeTranscriber: Timer tick");
              setRecordingDuration((prev) => {
                const newValue = prev + 1;
                console.log("RealTimeTranscriber: Timer updated:", newValue);
                return newValue;
              });
            }, 1000);
            timerRef.current = timerId;
            console.log("RealTimeTranscriber: Timer started with ID:", timerId);
          } else if (request.message.status === "stopped") {
            console.log("RealTimeTranscriber: Recording stopped successfully");
            setStatusMessage("");

            // Stop the recording duration timer
            if (timerRef.current) {
              console.log(
                "RealTimeTranscriber: Stopping timer:",
                timerRef.current
              );
              window.clearInterval(timerRef.current);
              timerRef.current = null;
            }

            // Check if there's a recording available
            if (request.message.recordingUrl) {
              setRecordedAudioUrl(request.message.recordingUrl);
              setStatusMessage("Recording saved. You can now transcribe it.");
            }
          }
          break;
        case "RECORDING_COMPLETED":
          console.log("RealTimeTranscriber: Recording completed");
          // Handle recording completed message
          if (request.message.audioUrl) {
            setRecordedAudioUrl(request.message.audioUrl);

            // Auto-transcribe recording if that's the desired behavior
            if (request.message.autoTranscribe) {
              transcribeRecordedAudio(request.message.audioUrl);
            }
          }
          break;
        case "RECORDING_ERROR":
          console.error(
            "RealTimeTranscriber: Recording error:",
            request.message.error
          );
          setCaptureError(`Recording error: ${request.message.error}`);
          setIsCapturing(false);

          // Stop the recording duration timer on error
          if (timerRef.current) {
            console.log("RealTimeTranscriber: Stopping timer on error");
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          break;
      }
    };

    // Add message listener
    console.log("RealTimeTranscriber: Adding message listener");
    chrome.runtime.onMessage.addListener(handleMessages);

    return () => {
      // Remove message listener and clear timer when component unmounts
      console.log("RealTimeTranscriber: Cleanup - removing message listener");
      chrome.runtime.onMessage.removeListener(handleMessages);
      if (timerRef.current) {
        console.log(
          "RealTimeTranscriber: Cleanup - clearing timer:",
          timerRef.current
        );
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isCapturing]);

  // Process incoming audio data from the offscreen document
  const handleAudioData = async (audioData: ArrayBuffer) => {
    try {
      console.log(
        "RealTimeTranscriber: Processing audio data of size:",
        audioData.byteLength
      );

      if (!audioContextRef.current) {
        console.error("RealTimeTranscriber: Audio context not initialized");
        return;
      }

      // Convert ArrayBuffer to AudioBuffer
      const audioArrayBuffer = await audioContextRef.current.decodeAudioData(
        audioData
      );
      console.log(
        "RealTimeTranscriber: Decoded audio buffer, duration:",
        audioArrayBuffer.duration
      );

      // Process the audio with Whisper
      console.log(
        "RealTimeTranscriber: Processing audio chunk with Whisper..."
      );
      await transcriber.start(audioArrayBuffer);
    } catch (error) {
      console.error("RealTimeTranscriber: Error processing audio data:", error);
    }
  };

  // New function to transcribe recorded audio from URL
  const transcribeRecordedAudio = async (audioUrl: string) => {
    try {
      setIsTranscribingRecording(true);
      setStatusMessage("Transcribing recorded audio...");

      console.log(
        "RealTimeTranscriber: Transcribing recorded audio from URL:",
        audioUrl
      );

      // Fetch the audio data from the blob URL
      const response = await fetch(audioUrl);
      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Make sure we have an audio context
      if (!audioContextRef.current) {
        console.error("RealTimeTranscriber: Audio context not initialized");
        audioContextRef.current = new AudioContext({
          sampleRate: SAMPLING_RATE,
          latencyHint: "interactive",
        });
      }

      // Decode the audio data
      const audioArrayBuffer = await audioContextRef.current.decodeAudioData(
        arrayBuffer
      );
      console.log(
        "RealTimeTranscriber: Decoded recorded audio, duration:",
        audioArrayBuffer.duration
      );

      // Process with Whisper
      console.log(
        "RealTimeTranscriber: Processing recorded audio with Whisper..."
      );
      await transcriber.start(audioArrayBuffer);

      setStatusMessage("Transcription complete!");
    } catch (error) {
      console.error(
        "RealTimeTranscriber: Error transcribing recorded audio:",
        error
      );
      setStatusMessage(`Transcription error: ${error}`);
    } finally {
      setIsTranscribingRecording(false);
    }
  };

  // Listen for last recording from background script
  useEffect(() => {
    const checkLastRecording = async () => {
      try {
        const response = await browser.runtime.sendMessage({
          action: "getLastRecording",
        });

        if (response && response.recording && response.recording.url) {
          setRecordedAudioUrl(response.recording.url);
        }
      } catch (error) {
        console.error("Error getting last recording:", error);
      }
    };

    checkLastRecording();
  }, []);

  // Request microphone permission using iframe approach
  const requestMicPermissionWithIframe = async () => {
    try {
      console.log("RealTimeTranscriber: Requesting permission with iframe");
      setPermissionStatus("checking");
      setCaptureError(null);

      // Use the iframe-based permission request
      await requestMicrophonePermission();

      // If we get here, permission was granted
      console.log("RealTimeTranscriber: Permission granted via iframe");
      setPermissionStatus("granted");
      setAudioSources((prev) => ({ ...prev, hasMicrophone: true }));
    } catch (error: any) {
      console.error("RealTimeTranscriber: Error requesting permission:", error);
      setPermissionStatus("denied");
      setCaptureError(`Microphone permission error: ${error.toString()}`);
    }
  };

  // Check microphone permission manually (use the iframe approach)
  const checkPermission = () => {
    requestMicPermissionWithIframe();
  };

  // Start audio capture using the offscreen document
  const startCapture = async () => {
    console.log("RealTimeTranscriber: Starting capture");
    setCaptureError(null);
    setStatusMessage("Initializing audio capture...");

    try {
      // First make sure we have permission
      if (permissionStatus !== "granted") {
        console.log(
          "RealTimeTranscriber: Permission not granted, requesting..."
        );
        try {
          await requestMicPermissionWithIframe();
        } catch (error: any) {
          console.error(
            "RealTimeTranscriber: Permission request failed:",
            error
          );
          setCaptureError(`Permission error: ${error.toString()}`);
          return;
        }
      }

      // If we got here, we have permission, so start recording
      setIsCapturing(true);

      // Send message to background script to start recording
      console.log(
        "RealTimeTranscriber: Sending TOGGLE_RECORDING START message"
      );
      chrome.runtime.sendMessage(
        {
          message: {
            type: "TOGGLE_RECORDING",
            data: "START",
          },
        },
        (response) => {
          console.log(
            "RealTimeTranscriber: Received response for TOGGLE_RECORDING START:",
            response
          );
          if (response && response.error) {
            setCaptureError(`Error starting recording: ${response.error}`);
            setIsCapturing(false);
          }
        }
      );
    } catch (error: any) {
      console.error("RealTimeTranscriber: Error in startCapture:", error);
      setCaptureError(`Error starting capture: ${error.toString()}`);
      setIsCapturing(false);
    }
  };

  // Stop audio capture
  const stopCapture = () => {
    console.log("RealTimeTranscriber: Stopping capture");
    // Send message to background script to stop recording
    chrome.runtime.sendMessage(
      {
        message: {
          type: "TOGGLE_RECORDING",
          data: "STOP",
        },
      },
      (response) => {
        console.log(
          "RealTimeTranscriber: Received response for TOGGLE_RECORDING STOP:",
          response
        );
      }
    );

    setStatusMessage("");
    setIsCapturing(false);
  };

  // Handle toggle capture button
  const handleToggleCapture = () => {
    console.log(
      "RealTimeTranscriber: Toggle capture button clicked, current state:",
      isCapturing
    );
    if (isCapturing) {
      stopCapture();
    } else {
      startCapture();
    }
  };

  // Listen for transcriber updates
  useEffect(() => {
    if (transcriber.output?.text) {
      // Update with new transcription
      const text = transcriber.output.text;
      console.log("RealTimeTranscriber: New transcription:", text);

      // Send to callback if provided
      if (onTranscriptionUpdate) {
        onTranscriptionUpdate(text);
      }

      // Update store
      updateTranscription({
        text,
        fullTranscript: text,
      });
    }
  }, [transcriber.output?.text, onTranscriptionUpdate, updateTranscription]);

  // Format seconds into MM:SS format
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get the indicator color based on permission status
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

  // Get permission status text
  const getPermissionText = () => {
    switch (permissionStatus) {
      case "granted":
        return "Microphone access granted";
      case "denied":
        return "Microphone access denied";
      case "prompt":
        return "Microphone permission needed";
      case "checking":
        return "Checking microphone permission...";
      default:
        return "Microphone permission unknown";
    }
  };

  // Open permission test page
  const openPermissionTestPage = () => {
    const url = chrome.runtime.getURL("permissionTest.html");
    window.open(url, "_blank");
  };

  // Replace the old requestMicrophonePermission function with our new approach
  const requestMicrophonePermission = requestMicPermissionWithIframe;

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-medium mb-4">Real-time Transcription</h3>

      {captureError && (
        <div className="w-full p-3 mb-4 bg-red-100 border border-red-300 rounded text-red-700">
          {captureError}
        </div>
      )}

      {/* Add the PermissionTest component for debugging */}
      <div className="w-full mb-4">
        <PermissionTest />
      </div>

      {statusMessage && (
        <div className="w-full p-2 mb-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
          {statusMessage}
          {isCapturing && recordingDuration > 0 && (
            <span className="ml-2 font-medium">
              [{formatDuration(recordingDuration)}]
            </span>
          )}
        </div>
      )}

      {/* Permission status indicator */}
      <div
        onClick={requestMicPermissionWithIframe}
        className="w-full p-2 mb-4 bg-gray-50 border border-gray-200 rounded text-sm cursor-pointer hover:bg-gray-100"
      >
        <div className="flex items-center">
          <div
            className={`w-3 h-3 rounded-full ${getPermissionColor()} mr-2`}
          ></div>
          <span>{getPermissionText()}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Click to check permission status again
        </div>
      </div>

      {/* Permission request button - only show when permission is denied or unknown */}
      {(permissionStatus === "denied" ||
        permissionStatus === "unknown" ||
        permissionStatus === "prompt") && (
        <div className="w-full mb-4">
          <div className="flex flex-col space-y-2">
            <button
              onClick={requestMicPermissionWithIframe}
              className="w-full py-2 px-4 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-sm font-medium"
            >
              Request Microphone Permission
            </button>
            <button
              onClick={openPermissionTestPage}
              className="w-full py-2 px-4 bg-green-100 hover:bg-green-200 text-green-700 rounded-md text-sm font-medium"
            >
              Open Permission Test Page
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-1 text-center">
            Chrome requires direct permission for microphone access
          </div>
        </div>
      )}

      <div className="flex flex-col space-y-3 w-full items-center">
        <button
          className={`px-6 py-2 rounded-full font-medium ${
            isCapturing
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          } transition-colors flex items-center`}
          onClick={handleToggleCapture}
          disabled={
            permissionStatus === "denied" || permissionStatus === "checking"
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-2"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            {isCapturing ? (
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                clipRule="evenodd"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                clipRule="evenodd"
              />
            )}
          </svg>
          {isCapturing ? "Stop Transcribing" : "Start Transcribing"}
        </button>
      </div>

      {/* Test indicator for recording status */}
      {isCapturing && (
        <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2 animate-pulse"></div>
            <span>Recording active: {formatDuration(recordingDuration)}</span>
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500">
        <p>Audio capture requires permission to access your microphone.</p>
        <p>
          For best results, try using this on a meeting tab like Google Meet or
          Zoom.
        </p>
      </div>

      {transcriber.isModelLoading && (
        <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded">
          <p className="font-medium">Loading Whisper model...</p>
        </div>
      )}

      {recordedAudioUrl && (
        <div className="mt-4 p-4 border rounded bg-gray-50">
          <h3 className="text-sm font-medium mb-2">Recorded Audio</h3>
          <audio controls src={recordedAudioUrl} className="w-full mb-2" />
          <button
            onClick={() => transcribeRecordedAudio(recordedAudioUrl)}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
            disabled={isTranscribingRecording}
          >
            {isTranscribingRecording
              ? "Transcribing..."
              : "Transcribe Recording"}
          </button>
        </div>
      )}
    </div>
  );
}
