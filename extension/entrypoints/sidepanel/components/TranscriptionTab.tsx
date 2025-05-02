import { useEffect, useState } from "react";
import useStore from "../utils/store";
import RealTimeAudioTranscriber from "./RealTimeAudioTranscriber";
import { useTranscriber } from "../hooks/useTranscriber";

interface TranscriptionTabProps {
  // Props can be added here as needed
}

const TranscriptionTab: React.FC<TranscriptionTabProps> = () => {
  // Get store values and actions
  const proposeTool = useStore((state) => state.proposeTool);
  const fullTranscript = useStore((state) => state.fullTranscript);

  // Get transcriber and track loading state
  const transcriber = useTranscriber();
  const [modelLoadingStatus, setModelLoadingStatus] =
    useState<string>("initializing");

  // Preload the Whisper model as soon as the tab is opened
  useEffect(() => {
    const preloadWhisperModel = async () => {
      console.log("Explicitly preloading Whisper model when tab opens...");

      // If model is already loaded, mark as ready
      if (
        !transcriber.isModelLoading &&
        transcriber.progressItems.length === 0
      ) {
        console.log("Model already loaded, no need to preload");
        setModelLoadingStatus("ready");
        return;
      }

      try {
        // Force the model to initialize by calling onInputChange
        // This tells the transcriber to start loading the model
        transcriber.onInputChange();

        // Create a fake empty audio buffer to initialize the model
        // This is a way to "warm up" the model before actual use
        const SAMPLE_RATE = 16000;
        const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        const emptyBuffer = audioCtx.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);

        // Send the empty buffer to the transcriber to initialize model loading
        setTimeout(() => {
          try {
            // Only do this if the model isn't already loading
            if (transcriber.isModelLoading) {
              console.log(
                "Model is already loading, skipping explicit preload"
              );
            } else {
              console.log("Sending empty buffer to force model initialization");
              transcriber.start(emptyBuffer);
            }
          } catch (error) {
            console.error("Error during forced model preload:", error);
          }
        }, 1000);
      } catch (error) {
        console.error("Error preloading model:", error);
      }
    };

    // Start preloading right away
    preloadWhisperModel();

    // Set up a loading check interval
    const loadingInterval = setInterval(() => {
      if (
        !transcriber.isModelLoading &&
        transcriber.progressItems.length === 0
      ) {
        console.log("Model loading completed, setting status to ready");
        setModelLoadingStatus("ready");
        clearInterval(loadingInterval);
      } else {
        // Calculate and display the progress if available
        if (transcriber.progressItems.length > 0) {
          const totalProgress =
            transcriber.progressItems.reduce(
              (sum, item) => sum + item.progress,
              0
            ) / transcriber.progressItems.length;

          const progressPercent = Math.round(totalProgress * 100);
          console.log(`Model loading progress: ${progressPercent}%`);
        }
      }
    }, 1000);

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      setModelLoadingStatus("ready");
      clearInterval(loadingInterval);
      console.log("Safety timeout triggered, setting model status to ready");
    }, 60000); // 60 seconds

    return () => {
      clearInterval(loadingInterval);
      clearTimeout(safetyTimeout);
    };
  }, [transcriber]);

  // Process the full transcript for special commands or actions
  useEffect(() => {
    if (fullTranscript) {
      // Detect scheduling patterns in the transcript
      const lowerText = fullTranscript.toLowerCase();
      const hasSchedulingKeywords =
        (lowerText.includes("schedule") ||
          lowerText.includes("meeting") ||
          lowerText.includes("appointment")) &&
        (lowerText.includes("at ") ||
          lowerText.includes(" for ") ||
          lowerText.includes("o'clock") ||
          lowerText.includes("pm") ||
          lowerText.includes("am"));

      if (hasSchedulingKeywords) {
        console.log("DETECTED SCHEDULING in transcript");

        // Extract time and date using regex
        const timePattern = /\b(\d{1,2})\s*(am|pm|:\d{2})\b/i;
        const datePattern =
          /\b(tomorrow|today|next\s+\w+|this\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

        const timeMatch = lowerText.match(timePattern);
        const dateMatch = lowerText.match(datePattern);

        if (timeMatch) {
          // If we've detected scheduling with a time, notify the system
          proposeTool({
            toolName: "scheduleAppointment",
            parameters: {
              time: timeMatch[0],
              date: dateMatch ? dateMatch[0] : undefined,
              description: "Meeting from transcript",
            },
          });
        }
      }
    }
  }, [fullTranscript, proposeTool]);

  // Render loading indicator if model is still loading
  const renderModelLoadingStatus = () => {
    if (modelLoadingStatus === "ready") return null;

    // Calculate progress from transcriber if available
    let progressWidth = "50%";
    let statusText = "Initializing Whisper transcription model...";

    if (transcriber.progressItems.length > 0) {
      const totalProgress =
        transcriber.progressItems.reduce(
          (sum, item) => sum + item.progress,
          0
        ) / transcriber.progressItems.length;

      const progressPercent = Math.round(totalProgress * 100);
      progressWidth = `${progressPercent}%`;
      statusText = `Loading Whisper model: ${progressPercent}%`;
    }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-95 z-50 p-8 animate-fadeInOut">
        <button
          className="absolute top-4 right-4 bg-gray-200 hover:bg-gray-300 w-8 h-8 rounded-full flex items-center justify-center text-gray-600 cursor-pointer"
          onClick={() => setModelLoadingStatus("ready")}
          title="Dismiss this message"
        >
          ✕
        </button>
        <div className="flex flex-col items-center bg-white p-8 rounded-lg shadow-lg max-w-xl text-center">
          <div className="mb-4">
            <div className="w-10 h-10 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          <p>
            <strong>{statusText}</strong>
          </p>
          <div className="w-full h-2 bg-gray-200 rounded-md overflow-hidden mt-3 mb-3">
            <div
              className="h-full bg-blue-600 rounded-md transition-all duration-300"
              style={{ width: progressWidth }}
            ></div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            <strong>
              Please wait for the model to finish loading before transcribing.
            </strong>
            <br />
            The model is loaded only once and will be ready for instant
            transcription after this.
            <br />
            <span className="block text-xs text-gray-500 mt-2">
              (Click the X in the top-right if this message gets stuck)
            </span>
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full h-full overflow-auto">
      {/* Global model loading status */}
      {renderModelLoadingStatus()}

      {/* Use RealTimeAudioTranscriber to take up most of the space */}
      <div className="flex-grow overflow-y-auto">
        <RealTimeAudioTranscriber />
      </div>
    </div>
  );
};

export default TranscriptionTab;
