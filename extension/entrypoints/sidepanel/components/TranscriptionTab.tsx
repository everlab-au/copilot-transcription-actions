import { useEffect, useRef, useState } from "react";
import useStore from "../utils/store";
import RealTimeAudioTranscriber from "./RealTimeAudioTranscriber";

interface TranscriptionTabProps {
  // Props can be added here as needed
}

const TranscriptionTab: React.FC<TranscriptionTabProps> = () => {
  // Get store values and actions
  const updateTranscription = useStore((state) => state.updateTranscription);
  const proposeTool = useStore((state) => state.proposeTool);
  const fullTranscript = useStore((state) => state.fullTranscript);

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

  // Prepare the formatted transcript for display
  const getFormattedTranscript = () => {
    if (!fullTranscript) {
      return "No transcription available yet. Start recording and transcribing to see content here.";
    }

    // Add any formatting or highlighting as needed
    return fullTranscript;
  };

  return (
    <div className="flex flex-col w-full h-full p-4 space-y-6 overflow-auto">
      {/* Use the new RealTimeAudioTranscriber component that combines recording and transcription */}
      <RealTimeAudioTranscriber />

      {/* Full transcript display */}
      <div className="w-full mt-6 bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium">Full Transcript</h3>

          {fullTranscript && (
            <button
              onClick={() => {
                // Copy text to clipboard
                navigator.clipboard.writeText(fullTranscript);
              }}
              className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
            >
              Copy Text
            </button>
          )}
        </div>

        <div className="border rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap">
          {getFormattedTranscript()}
        </div>
      </div>

      {/* Footer with information */}
      <div className="text-center text-xs text-gray-500 mt-auto">
        <p>Start recording to automatically transcribe your audio.</p>
        <p>
          The system will detect scheduling keywords and offer to create
          calendar events.
        </p>
      </div>
    </div>
  );
};

export default TranscriptionTab;
