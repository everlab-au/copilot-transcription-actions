import { useTranscriber } from "../hooks/useTranscriber";
import { AudioManager } from "./AudioManager";
import Transcript from "./Transcript";
import { useEffect, useRef, useState } from "react";
import useStore from "../utils/store";

interface TranscriptionTabProps {
  // Props can be added here as needed
}

const TranscriptionTab: React.FC<TranscriptionTabProps> = () => {
  const transcriber = useTranscriber();
  const lastTextRef = useRef<string>("");
  const fullTranscriptRef = useRef<string>("");
  const [pendingText, setPendingText] = useState<string>("");

  // Get store actions
  const updateTranscription = useStore((state) => state.updateTranscription);
  const proposeTool = useStore((state) => state.proposeTool);

  // Threshold in milliseconds to wait for more text before considering a segment complete
  const BUFFER_THRESHOLD = 1000;
  const bufferTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Process new transcription data
  useEffect(() => {
    const transcribedText = transcriber.output?.text || "";
    console.log("Transcription output:", transcribedText);

    // Only process if we have new text
    if (transcribedText && transcribedText !== lastTextRef.current) {
      // Calculate the new text portion
      const newText = transcribedText.replace(lastTextRef.current, "").trim();
      console.log("New transcription text detected:", newText);

      if (newText) {
        // Add to pending text buffer
        setPendingText((prev) => {
          const updatedPendingText = prev ? `${prev} ${newText}` : newText;
          console.log("Updated pending text buffer:", updatedPendingText);
          return updatedPendingText;
        });

        // Clear any existing timer
        if (bufferTimerRef.current) {
          clearTimeout(bufferTimerRef.current);
        }

        // Set a timer to emit the aggregated text after a delay
        bufferTimerRef.current = setTimeout(() => {
          // We've waited long enough, emit the buffered text
          emitBufferedText();
          bufferTimerRef.current = null;
        }, BUFFER_THRESHOLD);
      }

      // Update the last text reference
      lastTextRef.current = transcribedText;
    }
  }, [transcriber.output?.text]);

  // Process the buffered text as a complete segment
  const emitBufferedText = () => {
    if (pendingText) {
      console.log("Processing buffered text as complete segment:", pendingText);

      // Check for sentence completeness (basic heuristic)
      const isComplete = /[.!?]$/.test(pendingText);
      const textToEmit = isComplete ? pendingText : pendingText + ".";

      // Update the full transcript
      fullTranscriptRef.current = fullTranscriptRef.current
        ? `${fullTranscriptRef.current}\n${textToEmit}`
        : textToEmit;

      // Detect scheduling patterns in the complete segment
      const lowerText = textToEmit.toLowerCase();
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
        console.log("DETECTED SCHEDULING in complete segment:", textToEmit);

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

      // Use Zustand store to update transcription
      console.log("Using store to update transcription with complete segment");
      updateTranscription({
        text: textToEmit,
        fullTranscript: fullTranscriptRef.current,
      });

      // Clear the pending text
      setPendingText("");
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="container flex flex-col justify-center items-center">
        <AudioManager transcriber={transcriber} />
        <Transcript transcribedData={transcriber.output} />
      </div>
    </div>
  );
};

export default TranscriptionTab;
