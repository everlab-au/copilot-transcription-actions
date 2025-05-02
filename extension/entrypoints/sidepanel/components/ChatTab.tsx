import { useState, useEffect, ReactNode } from "react";
import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotAction, useCopilotContext } from "@copilotkit/react-core";
import useStore from "../utils/store";

interface MeetingDetails {
  time: string;
  date: string;
  description?: string;
}

interface MeetingProposalProps {
  meeting: MeetingDetails;
  onAccept: () => void;
  onReject: () => void;
}

// Custom meeting proposal component
const MeetingProposal = ({
  meeting,
  onAccept,
  onReject,
}: MeetingProposalProps) => {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mt-3 bg-gray-50">
      <h3 className="mt-0 text-base font-medium text-gray-900">
        📅 Meeting Proposal
      </h3>
      <div className="mb-2">
        <div>
          <strong>Time:</strong> {meeting.time}
        </div>
        <div>
          <strong>Date:</strong> {meeting.date || "Today"}
        </div>
        {meeting.description && (
          <div>
            <strong>Description:</strong> {meeting.description}
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onAccept}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
};

// Component for displaying and integrating with transcription
const ChatTab = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(true);
  const [pendingMeeting, setPendingMeeting] = useState<MeetingDetails | null>(
    null
  );
  const [customActions, setCustomActions] = useState<
    Array<{
      id: string;
      meeting: MeetingDetails;
      onAccept: () => void;
      onReject: () => void;
    }>
  >([]);

  // Get store state and actions
  const latestTranscription = useStore((state) => state.latestTranscription);
  const fullTranscript = useStore((state) => state.fullTranscript);
  const actionResults = useStore((state) => state.actionResults);
  const addActionResult = useStore((state) => state.addActionResult);
  const clearActionResults = useStore((state) => state.clearActionResults);

  // For debugging purposes - to see when the component re-renders
  console.log(
    "ChatTab rendering, current transcript:",
    latestTranscription ? latestTranscription.substring(0, 50) + "..." : "empty"
  );

  // Accept meeting handler
  const handleAcceptMeeting = (meeting: MeetingDetails) => {
    console.log("Accepting meeting:", meeting);
    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      // Add to action history
      addActionResult({
        action: {
          name: "Meeting Scheduled",
          parameters: meeting,
        },
        result: {
          success: true,
          message: `Meeting scheduled for ${meeting.time} on ${meeting.date}`,
          meetingDetails: {
            ...meeting,
            createdAt: new Date().toISOString(),
          },
        },
      });

      setLoading(false);
      setPendingMeeting(null);

      // Remove the custom action
      setCustomActions((prev) =>
        prev.filter(
          (action) =>
            action.meeting.time !== meeting.time ||
            action.meeting.date !== meeting.date
        )
      );

      // Ensure history is visible after accepting
      setShowHistory(true);
    }, 500);
  };

  // Reject meeting handler
  const handleRejectMeeting = (meeting: MeetingDetails) => {
    console.log("Rejecting meeting:", meeting);
    setPendingMeeting(null);

    // Remove the custom action
    setCustomActions((prev) =>
      prev.filter(
        (action) =>
          action.meeting.time !== meeting.time ||
          action.meeting.date !== meeting.date
      )
    );
  };

  // This action proposes a meeting for the user to accept or reject
  useCopilotAction({
    name: "recordMeeting",
    description: "Record a meeting in the calendar",
    parameters: [
      {
        name: "time",
        type: "string",
        description: "The time for the meeting (e.g., '4pm', '14:30')",
        required: true,
      },
      {
        name: "date",
        type: "string",
        description: "The date for the meeting (e.g., 'tomorrow', 'May 15')",
        required: false,
      },
      {
        name: "description",
        type: "string",
        description: "Description of the meeting",
        required: false,
      },
    ],
    handler: async (params: {
      time: string;
      date?: string;
      description?: string;
    }) => {
      console.log("recordMeeting action triggered with params:", params);

      const meetingDetails: MeetingDetails = {
        time: params.time,
        date: params.date || "today",
        description: params.description || "Meeting",
      };

      // Store the meeting details for later access
      setPendingMeeting(meetingDetails);

      // Add a custom action to be rendered in the chat
      const newAction = {
        id: Date.now().toString(),
        meeting: meetingDetails,
        onAccept: () => handleAcceptMeeting(meetingDetails),
        onReject: () => handleRejectMeeting(meetingDetails),
      };

      setCustomActions((prev) => [...prev, newAction]);

      // Add a special div for our component to render into
      return (
        "I've prepared a meeting proposal for " +
        params.time +
        " on " +
        (params.date || "today") +
        ".\n\n" +
        "**Would you like to schedule this meeting?** (Accept or Reject)"
      );
    },
  });

  // Get instructions for the copilot
  const getInstructions = () => {
    const baseInstructions = `You are a meeting assistant. You can help schedule meetings and capture action items.

When someone mentions scheduling a meeting at a specific time:
1. Simply ask them if they want to schedule it. For example: "I noticed you mentioned a meeting at 3pm tomorrow. Would you like me to schedule that for you?"
2. If they say yes, use the recordMeeting function to add it to their calendar.
3. NEVER try to automatically extract or detect meetings from the transcript.

You can refer to this recent transcription to better assist the user:
${fullTranscript || "No transcription available yet."}`;

    return baseInstructions;
  };

  // Render pending meeting proposals below the chat box
  const renderPendingMeetings = () => {
    if (customActions.length === 0) return null;

    return (
      <div className="border-t border-gray-200 p-4 bg-white">
        <h3 className="text-base font-semibold text-gray-800 mt-0 mb-3">
          Pending Meeting Proposals
        </h3>
        <div className="space-y-3">
          {customActions.map((action) => (
            <MeetingProposal
              key={action.id}
              meeting={action.meeting}
              onAccept={action.onAccept}
              onReject={action.onReject}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Chat area with flex-grow to take available space */}
      <div className="flex-grow overflow-y-auto">
        <CopilotChat
          instructions={getInstructions()}
          labels={{
            title: "Meeting Assistant",
            initial:
              "Hi! 👋 I'm your meeting assistant. I can help schedule meetings and track action items during your call.",
            placeholder: "Ask something about your meeting...",
          }}
          className="h-full w-full border-none shadow-none"
        />
      </div>

      {/* Render pending meetings */}
      {renderPendingMeetings()}

      {/* Toggle button for history */}
      <div className="flex justify-between items-center px-4 py-2 bg-gray-100 border-t border-gray-200">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm font-medium text-gray-700 flex items-center"
        >
          {showHistory ? "▼ Hide History" : "▲ Show History"}
          {actionResults.length > 0 && (
            <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {actionResults.length}
            </span>
          )}
        </button>

        {showHistory && actionResults.length > 0 && (
          <button
            onClick={clearActionResults}
            className="text-sm px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Meeting history section - collapsible with fixed height */}
      {showHistory && actionResults.length > 0 && (
        <div className="bg-gray-50 border-t border-gray-200 p-4 h-64 overflow-y-auto">
          <h3 className="text-base font-semibold text-gray-800 mt-0 mb-2 sticky top-0 bg-gray-50 pb-2 z-10">
            Meeting History
          </h3>
          <ul className="list-none p-0 m-0 divide-y divide-gray-200">
            {actionResults.map((result, index) => (
              <li
                key={index}
                className="py-3 first:pt-0 hover:bg-gray-100 px-2 rounded-md transition-colors"
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-900">
                    {result.action.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-1 text-sm grid grid-cols-2 gap-x-2 gap-y-1">
                  <div>
                    <span className="font-medium">Time:</span>{" "}
                    {result.action.parameters.time}
                  </div>
                  <div>
                    <span className="font-medium">Date:</span>{" "}
                    {result.action.parameters.date}
                  </div>
                  {result.action.parameters.description && (
                    <div className="col-span-2">
                      <span className="font-medium">Description:</span>{" "}
                      {result.action.parameters.description}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ChatTab;
