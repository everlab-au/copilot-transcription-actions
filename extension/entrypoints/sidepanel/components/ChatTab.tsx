import { useState, useEffect, useRef } from "react";
import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotAction } from "@copilotkit/react-core";
import useStore from "../utils/store";

// Component for displaying and integrating with transcription
const ChatTab = () => {
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [suggestedScheduling, setSuggestedScheduling] =
    useState<boolean>(false);

  // Get store state and actions
  const latestTranscription = useStore((state) => state.latestTranscription);
  const fullTranscript = useStore((state) => state.fullTranscript);
  const actionResults = useStore((state) => state.actionResults);
  const addActionResult = useStore((state) => state.addActionResult);
  const clearActionResults = useStore((state) => state.clearActionResults);
  const proposeTool = useStore((state) => state.proposeTool);

  // For debugging purposes - to see when the component re-renders
  console.log(
    "ChatTab rendering, current transcript:",
    latestTranscription ? latestTranscription.substring(0, 50) + "..." : "empty"
  );

  // Register the schedule appointment action with CopilotKit
  useCopilotAction({
    name: "scheduleAppointment",
    description: "Schedule an appointment or meeting at a specific time",
    parameters: [
      {
        name: "time",
        type: "string",
        description: "The time for the appointment (e.g., '4pm', '14:30')",
        required: true,
      },
      {
        name: "date",
        type: "string",
        description:
          "Optional date for the appointment (e.g., 'tomorrow', 'May 15')",
        required: false,
      },
      {
        name: "description",
        type: "string",
        description: "Optional description of the appointment",
        required: false,
      },
    ],
    handler: async (params: {
      time: string;
      date?: string;
      description?: string;
    }) => {
      console.log("scheduleAppointment action triggered with params:", params);
      handleScheduleAction(params.time, params.date, params.description);
      return { status: "suggested" };
    },
  });

  // Helper to extract time, date, and description from text
  const extractSchedulingInfo = (text: string) => {
    const lowerText = text.toLowerCase();
    let time = "";
    let date = "";
    let description = "";

    // Extract time using regex patterns
    const timePatterns = [
      /\b(\d{1,2})\s*(am|pm)\b/i, // 3 pm, 11 am
      /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i, // 3:30, 3:30 pm
      /\b(\d{1,2})\s*o'clock\b/i, // 3 o'clock
    ];

    // Try each pattern
    for (const pattern of timePatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        time = match[0];
        break;
      }
    }

    // Extract date
    if (lowerText.includes("tomorrow")) {
      date = "tomorrow";
    } else if (lowerText.includes("today")) {
      date = "today";
    } else {
      // Try to match date patterns like "May 15", "next Monday"
      const datePattern =
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b|\b(next|this) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
      const match = lowerText.match(datePattern);
      if (match) {
        date = match[0];
      }
    }

    // Description could be anything remaining, but we'll keep it simple
    description = "Meeting";

    return { time, date, description };
  };

  // Listen for transcript updates from the store
  useEffect(() => {
    if (!latestTranscription) return;

    console.log(
      "ChatTab processing transcription update:",
      latestTranscription
    );

    // Analyze for potential scheduling mentions
    const lowerText = latestTranscription.toLowerCase();
    if (
      (lowerText.includes("schedule") ||
        lowerText.includes("meeting") ||
        lowerText.includes("appointment")) &&
      (lowerText.includes("at ") ||
        lowerText.includes(" for ") ||
        lowerText.includes("o'clock") ||
        lowerText.includes("pm") ||
        lowerText.includes("am"))
    ) {
      console.log("ChatTab detected potential scheduling in:", lowerText);

      // Extract scheduling information
      const { time, date, description } =
        extractSchedulingInfo(latestTranscription);

      // If we have at least a time, suggest scheduling
      if (time) {
        console.log("Extracted scheduling info:", { time, date, description });

        // Call handleScheduleAction directly - not through the action system
        createSchedulingProposal(time, date, description);

        // Mark as having suggested scheduling
        setSuggestedScheduling(true);
      }
    }
  }, [latestTranscription]);

  // Create a scheduling proposal action
  const createSchedulingProposal = (
    time: string,
    date?: string,
    description?: string
  ) => {
    console.log("Creating scheduling proposal:", { time, date, description });

    // Don't create multiple proposals for the same time/date
    if (
      pendingAction &&
      pendingAction.parameters.time === time &&
      pendingAction.parameters.date === date
    ) {
      console.log("Scheduling proposal already exists for this time/date");
      return;
    }

    const newProposal = {
      name: "Schedule Appointment",
      parameters: { time, date, description },
      handler: async (params: {
        time: string;
        date?: string;
        description?: string;
      }) => {
        setLoading(true);
        try {
          // For demonstration purposes, we're just returning a success message
          // In a real app, this would connect to a calendar API or scheduling service
          console.log(
            `Scheduling appointment for ${params.time}${
              params.date ? ` on ${params.date}` : ""
            }`
          );
          console.log(
            `Description: ${params.description || "No description provided"}`
          );

          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const result = {
            success: true,
            message: `Appointment scheduled for ${params.time}${
              params.date ? ` on ${params.date}` : ""
            }`,
            appointmentDetails: {
              time: params.time,
              date: params.date || "today",
              description: params.description || "No description provided",
            },
          };

          return result;
        } catch (error) {
          console.error("Error scheduling appointment:", error);
          throw error;
        } finally {
          setLoading(false);
        }
      },
    };

    setPendingAction(newProposal);

    // Use Zustand store instead of event bus
    proposeTool({
      toolName: "scheduleAppointment",
      parameters: { time, date, description },
    });
  };

  // Handle scheduling action from the MCP system
  const handleScheduleAction = (
    time: string,
    date?: string,
    description?: string
  ) => {
    console.log("handleScheduleAction called with:", {
      time,
      date,
      description,
    });
    // Create a scheduling proposal
    createSchedulingProposal(time, date, description);
  };

  // Execute the pending action
  const executeAction = async () => {
    if (!pendingAction) return;

    try {
      console.log("Executing action:", pendingAction.name);
      const result = await pendingAction.handler(pendingAction.parameters);
      const actionResult = {
        action: pendingAction,
        result,
      };

      // Update action results in the store
      addActionResult(actionResult);

      // Reset suggested state
      setSuggestedScheduling(false);

      setPendingAction(null);
    } catch (error) {
      console.error("Error executing action:", error);
      const actionError = {
        action: pendingAction,
        error: String(error),
      };

      // Update action results in the store with error
      addActionResult(actionError);

      // Reset suggested state
      setSuggestedScheduling(false);

      setPendingAction(null);
    }
  };

  // Cancel the pending action
  const cancelAction = () => {
    console.log("Action cancelled");

    // Reset suggested state
    setSuggestedScheduling(false);

    setPendingAction(null);
  };

  // Chat instructions with transcription context and direct action suggestion
  const getInstructions = () => {
    let baseInstructions = `You are a meeting assistant. Listen to the conversation and suggest actions when appropriate.
When someone mentions scheduling a meeting or appointment at a specific time, you MUST use the scheduleAppointment tool.

Example: If you hear "Let's schedule for tomorrow at 3pm", suggest using scheduleAppointment with time="3pm", date="tomorrow".

Recent transcription:
${fullTranscript || "No transcription available yet."}`;

    // If we've detected scheduling but it's not in the prompt yet, add a direct instruction
    if (suggestedScheduling && pendingAction) {
      const { time, date } = pendingAction.parameters;
      baseInstructions += `\n\nI've detected a scheduling request! Please suggest scheduling a meeting at ${time}${
        date ? ` on ${date}` : ""
      }.`;
    }

    console.log(
      "Providing instructions to CopilotChat:",
      baseInstructions.substring(0, 100) + "..."
    );
    return baseInstructions;
  };

  return (
    <>
      {pendingAction && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 m-4 shadow-sm animate-pulse-once">
          <h3 className="text-base font-semibold text-gray-800 mt-0 mb-2">
            Proposed Action:
          </h3>
          <p>
            <strong>{pendingAction.name}</strong>
          </p>
          <pre className="bg-gray-100 p-3 rounded-md overflow-x-auto text-sm my-2">
            {Object.entries(pendingAction.parameters).map(([key, value]) => (
              <div key={key} className="mb-1">
                <strong>{key}:</strong> {String(value)}
              </div>
            ))}
          </pre>
          <div className="flex gap-2 mt-4">
            <button
              onClick={executeAction}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "Processing..." : "Accept"}
            </button>
            <button
              onClick={cancelAction}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden h-full relative">
        <CopilotChat
          instructions={getInstructions()}
          labels={{
            title: "Meeting Assistant",
            initial:
              "Hi! 👋 I'm your meeting assistant. I can help schedule appointments and track action items during your call.",
            placeholder: "Ask something about your meeting...",
          }}
          className="flex-1 mb-5 flex flex-col h-full w-full border-none shadow-none"
        />

        {actionResults.length > 0 && (
          <div className="bg-gray-50 border-t border-gray-200 p-4 max-h-48 overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mt-0 mb-2">
              Action History
            </h3>
            <ul className="list-none p-0 m-0">
              {actionResults.map((result, index) => (
                <li
                  key={index}
                  className="mb-3 pb-3 border-b border-gray-200 last:border-0 last:mb-0"
                >
                  <div>
                    <strong>{result.action.name}</strong>
                    {" - "}
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </div>
                  <pre className="bg-gray-100 p-2 rounded-md overflow-x-auto text-xs mt-1">
                    {result.error
                      ? `Error: ${result.error}`
                      : JSON.stringify(result.result, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
            <button
              onClick={clearActionResults}
              className="px-3 py-1.5 mt-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Clear History
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default ChatTab;
