import { useState, useEffect, useRef } from "react";
import { useTranscriber } from "../hooks/useTranscriber";
import useStore from "../utils/store";

// Define the sampling rate for audio processing
const SAMPLING_RATE = 16000;

// TypeScript declaration for browser API used in WXT
declare const browser: any;

// Type for permission status
type PermissionStatus = "unknown" | "granted" | "denied";

// New types for transcript messages
type TranscriptSource = "microphone" | "tab";

interface TranscriptMessage {
  id: string;
  text: string;
  source: TranscriptSource;
  timestamp: string;
  audioUrl?: string;
}

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

  // Tab audio capture state
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isTabAudioRecording, setIsTabAudioRecording] =
    useState<boolean>(false);
  const [captureTimestamp, setCaptureTimestamp] = useState<string | null>(null);

  // New state for transcript messages
  const [transcriptMessages, setTranscriptMessages] = useState<
    TranscriptMessage[]
  >([]);
  const [currentTranscriptionSource, setCurrentTranscriptionSource] =
    useState<TranscriptSource>("microphone");

  // Reference to track the session ID for grouping transcriptions
  const micSessionIdRef = useRef<string | null>(null);
  const tabSessionIdRef = useRef<string | null>(null);

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
  const autoTranscriptionBufferRef = useRef<Float32Array[]>([]);
  const lastTranscriptionTimeRef = useRef<number>(0);

  // Add state for auto-transcription settings
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [lastChunkTime, setLastChunkTime] = useState<number | null>(null);
  const [transcriptionCount, setTranscriptionCount] = useState(0);

  // Watch transcriber output and update the store and transcript history
  useEffect(() => {
    if (transcriber.output && transcriber.output.text.trim()) {
      // Update the global transcription state
      updateTranscription({
        text: transcriber.output.text,
        fullTranscript: transcriber.output.text,
      });

      // Create a session ID if not exists for current source
      if (
        currentTranscriptionSource === "microphone" &&
        !micSessionIdRef.current
      ) {
        micSessionIdRef.current = Date.now().toString();
      } else if (
        currentTranscriptionSource === "tab" &&
        !tabSessionIdRef.current
      ) {
        tabSessionIdRef.current = Date.now().toString();
      }

      const currentSessionId =
        currentTranscriptionSource === "microphone"
          ? micSessionIdRef.current
          : tabSessionIdRef.current;

      // Create new message
      const newMessage: TranscriptMessage = {
        id: currentSessionId || Date.now().toString(),
        text: transcriber.output.text,
        source: currentTranscriptionSource,
        timestamp: new Date().toISOString(),
        audioUrl:
          currentTranscriptionSource === "microphone"
            ? audioUrl || undefined
            : downloadUrl || undefined,
      };

      // Update messages, replacing any with the same ID (consolidate)
      setTranscriptMessages((prevMessages) => {
        // Remove any existing message with the same ID
        const filteredMessages = prevMessages.filter(
          (m) => m.id !== newMessage.id
        );
        // Add the new message
        return [...filteredMessages, newMessage];
      });
    }
  }, [
    transcriber.output,
    updateTranscription,
    currentTranscriptionSource,
    audioUrl,
    downloadUrl,
  ]);

  // Reset session IDs when new recordings start
  const resetSessionIds = () => {
    micSessionIdRef.current = null;
    tabSessionIdRef.current = null;
  };

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

    if (previousTabStream) {
      previousTabStream.getTracks().forEach((track) => track.stop());
      previousTabStream = null;
    }

    // Stop any audio elements playing
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
    }

    // Close audio context if open
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
      setCurrentTranscriptionSource("microphone");
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
    // Reset session ID for microphone
    micSessionIdRef.current = null;

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

      // Create an audio context for microphone monitoring
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(micStream);

      // Create a gain node to control volume and prevent feedback
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.5; // Set to a lower value to prevent feedback

      // Connect the source to the gain node and the gain node to the destination
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

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

        // Disconnect audio monitoring
        source.disconnect();
        gainNode.disconnect();
        audioContext.close().catch((err) => {
          console.error("Error closing audio context:", err);
        });

        // Create a blob from the recorded chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        const audioUrl = URL.createObjectURL(audioBlob);

        setAudioUrl(audioUrl);

        // Save the recording via the background script
        await browser.runtime.sendMessage({
          action: "saveRecording",
          audioUrl: audioUrl,
          recordingSource: recordingSource,
        });

        // Update recording status with success message
        setRecordingStatus("Recording saved successfully!");

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

        // Also stop tab recording if it's active
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();

          // Reset tab recording state
          setIsTabAudioRecording(false);

          if (previousTabStream) {
            previousTabStream.getTracks().forEach((track) => track.stop());
            previousTabStream = null;
          }

          if (audioElementRef.current) {
            audioElementRef.current.srcObject = null;
          }
        }

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

  // Modify the transcribeLastRecording function
  const transcribeLastRecording = async () => {
    if (!audioUrl) {
      setTranscriptionStatus("No recording available to transcribe");
      return;
    }

    // Reset session ID for microphone to create a new entry
    micSessionIdRef.current = null;

    // Check if transcription is possible
    if (!canTranscribe()) {
      return;
    }

    try {
      setCurrentTranscriptionSource("microphone");
      setTranscriptionStatus("Transcribing microphone recording...");

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

  let previousTabStream: MediaStream | null = null;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const startCapture = async () => {
    // Reset session ID for tab audio
    tabSessionIdRef.current = null;

    setDownloadUrl(null);
    setIsTabAudioRecording(true);

    try {
      if (previousTabStream) {
        previousTabStream.getTracks().forEach((t) => t.stop());
        previousTabStream = null;
      }

      const tabStream = await new Promise<MediaStream>((resolve, reject) => {
        // @ts-ignore - Chrome browser API
        chrome.tabCapture.capture(
          { audio: true, video: false },
          (stream: MediaStream) => {
            // @ts-ignore - Chrome browser API
            if (!stream || chrome.runtime.lastError) {
              reject(
                // @ts-ignore - Chrome browser API
                chrome.runtime.lastError ||
                  new Error("Failed to capture tab audio")
              );
            } else {
              previousTabStream = stream;
              resolve(stream);
            }
          }
        );
      });

      // Create audio monitor to listen to tab audio live
      const audioMonitor = new Audio();
      audioMonitor.srcObject = tabStream;
      audioMonitor.play().catch((err) => {
        console.error("Error playing tab audio monitor:", err);
      });

      // Connect the stream to audio element for live monitoring
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = tabStream;
        audioElementRef.current.play().catch((err) => {
          console.error("Error playing audio:", err);
        });
      }

      // const micStream = await navigator.mediaDevices.getUserMedia({
      //   audio: true,
      // });
      // const mixedStream = new MediaStream([
      //   ...tabStream.getAudioTracks(),
      //   ...micStream.getAudioTracks(),
      // ]);

      const recorder = new MediaRecorder(tabStream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setIsTabAudioRecording(false);
        setCaptureTimestamp(new Date().toISOString());

        // Stop live monitoring
        audioMonitor.pause();
        audioMonitor.srcObject = null;

        // Stop live monitoring
        if (audioElementRef.current) {
          audioElementRef.current.srcObject = null;
        }

        // Make sure to stop all tracks in the stream
        if (previousTabStream) {
          previousTabStream.getTracks().forEach((track) => track.stop());
          previousTabStream = null;
        }
      };

      recorder.start();
      // No timeout - will continue until stopCapture is called
    } catch (err: unknown) {
      console.error("Recording error:", err);
      setIsTabAudioRecording(false);
      alert(
        `Recording failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const stopCapture = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();

      // Also ensure streams are stopped here in case onstop doesn't trigger
      if (previousTabStream) {
        previousTabStream.getTracks().forEach((track) => track.stop());
      }

      if (audioElementRef.current) {
        audioElementRef.current.srcObject = null;
      }
    }
  };

  // Modify the transcribeCapturedAudio function
  const transcribeCapturedAudio = async () => {
    if (!downloadUrl) {
      setTranscriptionStatus("No tab audio capture available to transcribe");
      return;
    }

    // Reset session ID for tab audio to create a new entry
    tabSessionIdRef.current = null;

    // Check if transcription is possible
    if (!canTranscribe()) {
      return;
    }

    try {
      setCurrentTranscriptionSource("tab");
      setTranscriptionStatus("Transcribing tab audio capture...");

      // Fetch the audio data from the blob URL
      const response = await fetch(downloadUrl);
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

  // New function to start both microphone and tab recording simultaneously
  const startGeneralRecording = async () => {
    try {
      // Check microphone permission first
      if (permissionStatus !== "granted") {
        await requestMicrophonePermission();
        // We need to check the permission status after the request again
        // Return early if permission isn't granted after request
        return; // Let the permission change listener handle the next steps
      }

      // Reset all session IDs
      resetSessionIds();

      // Set recording status
      setRecordingStatus(
        "Initializing recording of microphone and tab audio..."
      );
      setTranscriptionCount(0);
      setLastChunkTime(null);

      // Reset audio buffers
      audioBufferRef.current = [];
      isProcessingAudioRef.current = false;

      // First, let's start tab audio capture directly using Chrome API
      let tabStream: MediaStream | null = null;
      let tabStatus = "";
      try {
        tabStream = await new Promise<MediaStream>((resolve, reject) => {
          // @ts-ignore - Chrome browser API
          chrome.tabCapture.capture(
            { audio: true, video: false },
            (stream: MediaStream) => {
              // @ts-ignore - Chrome browser API
              if (!stream || chrome.runtime.lastError) {
                reject(
                  // @ts-ignore - Chrome browser API
                  chrome.runtime.lastError ||
                    new Error("Failed to capture tab audio")
                );
              } else {
                resolve(stream);
              }
            }
          );
        });

        // Create a live audio monitoring for tab audio
        const audioMonitor = new Audio();
        audioMonitor.srcObject = tabStream;
        audioMonitor.play().catch((err) => {
          console.error("Error playing tab audio monitor:", err);
        });

        // Connect the stream to audio element for live monitoring (hidden)
        if (audioElementRef.current) {
          audioElementRef.current.srcObject = tabStream;
          audioElementRef.current.play().catch((err) => {
            console.error("Error playing tab audio in element:", err);
          });
        }

        // Set up MediaRecorder for tab audio
        const tabRecorder = new MediaRecorder(tabStream);
        const tabChunks: Blob[] = [];
        tabRecorder.ondataavailable = (e: BlobEvent) => tabChunks.push(e.data);
        tabRecorder.onstop = () => {
          const blob = new Blob(tabChunks, { type: "audio/webm" });
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          setCaptureTimestamp(new Date().toISOString());
          console.log("Tab audio capture saved successfully");

          // Stop live monitoring
          audioMonitor.pause();
          audioMonitor.srcObject = null;

          // Stop all tracks in the stream
          if (tabStream) {
            tabStream
              .getTracks()
              .forEach((track: MediaStreamTrack) => track.stop());
          }
        };
        tabRecorder.start();
        recorderRef.current = tabRecorder;
        setIsTabAudioRecording(true);
        tabStatus = "✓ Tab audio capture active";
      } catch (tabError) {
        console.error("Error starting tab capture:", tabError);
        tabStatus = `✗ Tab audio capture failed: ${tabError}`;
        setIsTabAudioRecording(false);
      }

      // Now get microphone stream with high-quality settings
      let micStatus = "";
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: SAMPLING_RATE,
          },
        });

        streamRef.current = micStream;

        // Create an audio context for microphone monitoring
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(micStream);

        // Create a gain node to control volume and prevent feedback
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5; // Set to a lower value to prevent feedback

        // Connect the source to the gain node and the gain node to the destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Set up direct audio capture for real-time transcription
        const cleanup = setupDirectAudioCapture(micStream);

        // Notify the background script that we're doing a combined recording
        // This is mainly for state tracking
        await browser.runtime.sendMessage({
          action: "startRecording",
          source: "both", // Explicitly request both sources
        });

        // Set recording state
        setTabAudioCaptured(tabStream !== null);
        setRecordingSource(tabStream !== null ? "both" : "mic");

        // Create a media recorder for saving the microphone recording
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

          // Disconnect audio monitoring
          source.disconnect();
          gainNode.disconnect();
          audioContext.close().catch((err) => {
            console.error("Error closing audio context:", err);
          });

          // Create a blob from the recorded chunks
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          });
          const audioUrl = URL.createObjectURL(audioBlob);

          setAudioUrl(audioUrl);

          // Save the recording via the background script
          await browser.runtime.sendMessage({
            action: "saveRecording",
            audioUrl: audioUrl,
            recordingSource: recordingSource,
          });

          // Update recording status with success message
          setRecordingStatus("Recording saved successfully!");

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
        micStatus = "✓ Microphone recording active";

        setIsRecording(true);
        setIsTranscribing(autoTranscribe);
        startTimer();
      } catch (micError) {
        console.error("Error starting microphone recording:", micError);
        micStatus = `✗ Microphone recording failed: ${micError}`;
        stopMediaTracks();
      }

      // Update the final recording status based on both mic and tab status
      if (micStatus.startsWith("✓")) {
        if (tabStatus.startsWith("✓")) {
          setRecordingStatus(
            `Recording active: Both microphone and tab audio\n${micStatus}\n${tabStatus}`
          );
        } else {
          setRecordingStatus(
            `Recording active: Microphone only\n${micStatus}\n${tabStatus}`
          );
        }
      } else if (tabStatus.startsWith("✓")) {
        setRecordingStatus(
          `Recording active: Tab audio only\n${micStatus}\n${tabStatus}`
        );
      } else {
        setRecordingStatus(`Recording failed\n${micStatus}\n${tabStatus}`);
        // If both failed, ensure we're not in recording state
        setIsRecording(false);
      }
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

        {/* Add explanation text */}
        <div className="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
          <p className="font-medium mb-1">Combined Audio Recording</p>
          <p>
            This recorder captures both your microphone and the current tab's
            audio simultaneously. After recording, you can transcribe both
            sources separately.
          </p>
        </div>

        <div className="flex flex-col gap-4 items-center justify-center">
          {!isRecording ? (
            <div className="flex gap-2 flex-wrap justify-center">
              {/* Keep only the combined recording button */}
              <button
                onClick={startGeneralRecording}
                disabled={
                  permissionStatus !== "granted" || transcriber.isModelLoading
                }
                className={`flex items-center justify-center px-6 py-3 rounded-md font-medium text-white ${
                  permissionStatus !== "granted" || transcriber.isModelLoading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700"
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

              {/* Transcription buttons for existing recordings */}
              {audioUrl && (
                <button
                  onClick={transcribeLastRecording}
                  disabled={transcriber.isModelLoading || transcriber.isBusy}
                  className={`flex items-center justify-center px-6 py-3 rounded-md font-medium text-white ${
                    transcriber.isModelLoading || transcriber.isBusy
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Transcribe Microphone Recording
                </button>
              )}
              {downloadUrl && (
                <button
                  onClick={transcribeCapturedAudio}
                  disabled={transcriber.isModelLoading || transcriber.isBusy}
                  className={`flex items-center justify-center px-6 py-3 rounded-md font-medium text-white ${
                    transcriber.isModelLoading || transcriber.isBusy
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Transcribe Tab Recording
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

          {isTabAudioRecording && isRecording && (
            <div className="flex items-center mt-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2"></div>
              <span className="text-sm text-green-700 font-medium">
                Recording: {formatTime(recordingTime)}{" "}
              </span>
            </div>
          )}

          {/* Hidden audio element for monitoring */}
          <audio ref={audioElementRef} style={{ display: "none" }} controls />
        </div>

        {isRecording && (
          <div className="mt-4 flex items-center justify-center text-sm font-medium">
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

        {/* Add indicators for available recordings when not recording */}
        {!isRecording && (
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            {audioUrl && (
              <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs inline-flex items-center">
                <span className="mr-1">📁</span>
                Microphone Recording Available
              </div>
            )}
            {downloadUrl && (
              <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs inline-flex items-center">
                <span className="mr-1">🔊</span>
                Tab Audio Recording Available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcript Conversation */}
      <div className="bg-white rounded-lg shadow p-4 flex-grow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium">Transcript Conversation</h3>
          {transcriptMessages.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const fullText = transcriptMessages
                    .map(
                      (m) =>
                        `[${m.source}] ${formatTimestamp(m.timestamp)}: ${
                          m.text
                        }`
                    )
                    .join("\n\n");
                  navigator.clipboard.writeText(fullText);
                }}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Copy All
              </button>
              <button
                onClick={() => {
                  setTranscriptMessages([]);
                  setTranscriptionStatus("Transcript history cleared");
                }}
                className="text-xs px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-md"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-4 min-h-[300px] max-h-[500px] overflow-y-auto bg-gray-50">
          {transcriptMessages.length > 0 ? (
            <div className="flex flex-col space-y-4">
              {/* Sort messages by timestamp */}
              {transcriptMessages
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.timestamp).getTime() -
                    new Date(b.timestamp).getTime()
                )
                .map((message, index, sortedMessages) => {
                  // Check if we need to display a date header
                  const messageDate = new Date(message.timestamp);
                  const showDateHeader =
                    index === 0 ||
                    new Date(
                      sortedMessages[index - 1].timestamp
                    ).toDateString() !== messageDate.toDateString();

                  return (
                    <div key={message.id} className="flex flex-col">
                      {showDateHeader && (
                        <div className="text-center my-2">
                          <span className="inline-block px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-full">
                            {messageDate.toDateString()}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex ${
                          message.source === "microphone"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            message.source === "microphone"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                            <span className="font-semibold">
                              {message.source === "microphone"
                                ? "Microphone"
                                : "Tab Audio"}
                            </span>
                            <span>{messageDate.toLocaleTimeString()}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">
                            {message.text}
                          </p>
                          {message.audioUrl && (
                            <div className="mt-2">
                              <audio
                                src={message.audioUrl}
                                controls
                                className="w-full h-8"
                              ></audio>
                              <div className="flex justify-end mt-1">
                                <a
                                  href={message.audioUrl}
                                  download={`${message.source}-${new Date(
                                    message.timestamp
                                  ).getTime()}.webm`}
                                  className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded"
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-gray-500 italic text-center">
              {transcriber.isModelLoading
                ? "Waiting for model to load..."
                : "No transcriptions yet. Start recording or capture tab audio and transcribe them to see the conversation."}
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
    </div>
  );
}

export default RealTimeAudioTranscriber;
