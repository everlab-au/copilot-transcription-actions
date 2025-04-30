import { useState, useEffect } from "react";
import useStore from "../utils/store";

interface DebugEvent {
  type: string;
  data: any;
  timestamp: Date;
  isScheduling?: boolean;
}

const DebugPanel: React.FC = () => {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const [isVisible, setIsVisible] = useState(false);

  // Access store state
  const latestTranscription = useStore((state) => state.latestTranscription);
  const fullTranscript = useStore((state) => state.fullTranscript);
  const actionResults = useStore((state) => state.actionResults);
  const pendingTool = useStore((state) => state.pendingTool);

  // Subscribe to store changes
  useEffect(() => {
    if (latestTranscription) {
      // Check if this is a scheduling mention
      const text = latestTranscription.toLowerCase();
      const isScheduling =
        (text.includes("schedule") ||
          text.includes("meeting") ||
          text.includes("appointment")) &&
        (text.includes("at ") ||
          text.includes(" for ") ||
          text.includes("o'clock") ||
          text.includes("pm") ||
          text.includes("am") ||
          /\d+(:\d+)?/.test(text));

      addEvent(
        "TRANSCRIPTION",
        { text: latestTranscription, fullTranscript },
        isScheduling
      );
    }
  }, [latestTranscription]);

  // Subscribe to action results
  useEffect(() => {
    if (actionResults.length > 0) {
      // Only add the most recent action result
      const latestResult = actionResults[actionResults.length - 1];
      addEvent("ACTION", latestResult);
    }
  }, [actionResults.length]);

  // Subscribe to pending tools
  useEffect(() => {
    if (pendingTool) {
      addEvent("TOOL_PROPOSED", pendingTool);
    }
  }, [pendingTool]);

  useEffect(() => {
    // For development: Allow toggling debug panel with key shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "d") {
        setIsVisible((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const addEvent = (type: string, data: any, isScheduling?: boolean) => {
    setEvents((prev) => {
      const newEvents = [
        ...prev,
        { type, data, timestamp: new Date(), isScheduling },
      ];
      // Keep only the last 50 events
      return newEvents.slice(-50);
    });
  };

  const clearEvents = () => {
    setEvents([]);
  };

  // Helper to format transcription text with highlighting
  const formatTranscriptionText = (text: string, isScheduling?: boolean) => {
    if (!isScheduling) return text;

    // Bold the scheduling parts
    const schedulingKeywords = [
      "schedule",
      "meeting",
      "appointment",
      "tomorrow",
      "today",
      "am",
      "pm",
      "o'clock",
    ];
    let formattedText = text;

    schedulingKeywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      formattedText = formattedText.replace(
        regex,
        `<strong class="text-yellow-300">${keyword}</strong>`
      );
    });

    // Highlight times
    formattedText = formattedText.replace(
      /\b(\d+)(:\d+)?(\s*[ap]m)?\b/gi,
      '<strong class="text-yellow-300">$1$2$3</strong>'
    );

    return formattedText;
  };

  if (!isVisible) {
    return (
      <button
        className="fixed bottom-3 right-3 bg-gray-700 text-white p-2 rounded-full shadow-lg z-50 hover:bg-gray-800"
        onClick={() => setIsVisible(true)}
      >
        D
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-1/3 bg-gray-800 text-white shadow-lg z-40 rounded-t-lg overflow-hidden transition-all">
      <div
        className="p-2 bg-gray-900 flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-semibold">Debug Panel</span>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 bg-red-700 rounded text-xs"
            onClick={(e) => {
              e.stopPropagation();
              clearEvents();
            }}
          >
            Clear
          </button>
          <button
            className="px-2 py-1 bg-gray-700 rounded text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setIsVisible(false);
            }}
          >
            Hide
          </button>
          <span className="text-xs">{isExpanded ? "▼" : "▲"}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-64 overflow-y-auto p-2">
          <div className="flex gap-2 mb-3">
            <span className="px-2 py-1 bg-blue-600 rounded-full text-xs">
              Transcription:{" "}
              {events.filter((e) => e.type === "TRANSCRIPTION").length}
            </span>
            <span className="px-2 py-1 bg-green-600 rounded-full text-xs">
              Actions: {events.filter((e) => e.type === "ACTION").length}
            </span>
            {events.some((e) => e.isScheduling) && (
              <span className="px-2 py-1 bg-yellow-500 rounded-full text-xs">
                Scheduling detected
              </span>
            )}
          </div>

          {events.map((event, index) => (
            <div
              key={index}
              className={`mb-2 p-2 rounded ${
                event.isScheduling
                  ? "bg-yellow-900 border border-yellow-500"
                  : event.type === "TRANSCRIPTION"
                  ? "bg-blue-900"
                  : event.type === "TOOL_PROPOSED"
                  ? "bg-purple-900"
                  : "bg-green-900"
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-sm">{event.type}</span>
                <span className="text-xs opacity-70">
                  {event.timestamp.toLocaleTimeString()}
                </span>
              </div>
              {event.type === "TRANSCRIPTION" ? (
                <div
                  className="text-sm overflow-x-auto whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: formatTranscriptionText(
                      event.data.text,
                      event.isScheduling
                    ),
                  }}
                />
              ) : (
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              )}
            </div>
          ))}

          {events.length === 0 && (
            <div className="text-gray-400 text-center py-4">
              No events recorded yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
