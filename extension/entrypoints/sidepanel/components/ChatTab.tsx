import { useState, useEffect, ReactNode, useRef } from "react";
import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotAction, useCopilotContext } from "@copilotkit/react-core";
import useStore from "../utils/store";

interface MeetingDetails {
  time: string;
  date: string;
  description?: string;
  source?: "transcript" | "chat";
}

interface MeetingProposalProps {
  meeting: MeetingDetails;
  onAccept: () => void;
  onReject: () => void;
}

// Modern meeting proposal component with better UI
const MeetingProposal = ({
  meeting,
  onAccept,
  onReject,
}: MeetingProposalProps) => {
  const id = `meeting-proposal-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  return (
    <div
      className="rounded-lg p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 shadow-sm transition-all hover:shadow-md animate-fade-in"
      id={`${id}-container`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full p-2 mr-3 text-white shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-base flex items-center">
              Meeting Proposal
              {meeting.source === "transcript" && (
                <span className="animate-pulse ml-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                </span>
              )}
            </h3>
            <div className="text-sm text-gray-500 mt-1">
              {meeting.source === "transcript"
                ? "Detected from your conversation"
                : "Created from chat"}
            </div>
          </div>
        </div>
        {meeting.source === "transcript" && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            Auto-detected
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 bg-white p-3 rounded-md shadow-sm">
        <div className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-indigo-500 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-gray-700">
            <span className="font-medium">Time:</span> {meeting.time}
          </span>
        </div>
        <div className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-indigo-500 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-gray-700">
            <span className="font-medium">Date:</span> {meeting.date}
          </span>
        </div>
        {meeting.description && (
          <div className="col-span-2 flex items-start mt-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-indigo-500 mr-2 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-gray-700">
              <span className="font-medium">Description:</span>{" "}
              {meeting.description}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-4">
        <button
          id={`${id}-accept-btn`}
          onClick={onAccept}
          className="flex-1 flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 px-4 rounded-md font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 shadow-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Accept
        </button>
        <button
          id={`${id}-reject-btn`}
          onClick={onReject}
          className="flex-1 flex items-center justify-center bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-md font-medium hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
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
  const [autoSendProposals, setAutoSendProposals] = useState<boolean>(true);
  const [lastProcessedTranscript, setLastProcessedTranscript] =
    useState<string>("");

  // Get store state and actions
  const latestTranscription = useStore((state) => state.latestTranscription);
  const fullTranscript = useStore((state) => state.fullTranscript);
  const actionResults = useStore((state) => state.actionResults);
  const addActionResult = useStore((state) => state.addActionResult);
  const clearActionResults = useStore((state) => state.clearActionResults);
  const updateHasSchedulingContent = useStore(
    (state) => state.updateHasSchedulingContent
  );
  const hasSchedulingContent = useStore((state) => state.hasSchedulingContent);
  const activeTab = useStore((state) => state.activeTab);

  // Get the CopilotKit context to access chat manager
  const copilotContext = useCopilotContext();
  const [chatManager, setChatManager] = useState<any>(null);

  // Access chat manager when available
  useEffect(() => {
    if (copilotContext) {
      // @ts-ignore - CopilotKit doesn't expose the proper types but this works
      const manager = copilotContext.getChatManager?.();
      if (manager) {
        setChatManager(manager);
      }
    }
  }, [copilotContext]);

  // Proactively check for meeting patterns in full transcript
  useEffect(() => {
    if (
      !fullTranscript ||
      !chatManager ||
      fullTranscript === lastProcessedTranscript
    )
      return;

    // Update the last processed transcript
    setLastProcessedTranscript(fullTranscript);

    // Look for meeting mentions in the transcript
    const meetingDetails = extractMeetingDetails(fullTranscript);
    if (meetingDetails) {
      console.log("Detected meeting in full transcript:", meetingDetails);

      // Set the scheduling content flag to trigger UI notifications
      updateHasSchedulingContent(true);

      // Check if we already have a similar meeting proposed
      const isDuplicate = customActions.some(
        (action) =>
          action.meeting.time === meetingDetails.time &&
          action.meeting.date === meetingDetails.date
      );

      if (!isDuplicate && autoSendProposals) {
        // Add to custom actions for rendering
        const newAction = {
          id: Date.now().toString(),
          meeting: meetingDetails,
          onAccept: () => handleAcceptMeeting(meetingDetails),
          onReject: () => handleRejectMeeting(meetingDetails),
        };

        setCustomActions((prev) => [...prev, newAction]);

        // Proactively send message to chat whether the user has spoken or not
        setTimeout(() => {
          // Single message with clear proposal - no action links
          chatManager.addMessage({
            role: "assistant",
            content: `📅 I detected a meeting mentioned in your conversation at ${
              meetingDetails.time
            } on ${meetingDetails.date}${
              meetingDetails.description
                ? ` about "${meetingDetails.description}"`
                : ""
            }. Would you like to schedule this?\n\nPlease check the proposal in the section below.`,
          });
        }, 800);
      }
    }
  }, [fullTranscript, chatManager]);

  // Notify the chat when new transcription detected with meeting details
  useEffect(() => {
    if (!latestTranscription || !chatManager) return;

    const meetingDetails = extractMeetingDetails(latestTranscription);
    if (meetingDetails) {
      // Notify that scheduling content was detected
      updateHasSchedulingContent(true);

      // Check if we already have a similar meeting proposed
      const isDuplicate = customActions.some(
        (action) =>
          action.meeting.time === meetingDetails.time &&
          action.meeting.date === meetingDetails.date
      );

      if (!isDuplicate && autoSendProposals) {
        console.log("Detected meeting in transcript:", meetingDetails);

        // Add to custom actions for rendering
        const newAction = {
          id: Date.now().toString(),
          meeting: meetingDetails,
          onAccept: () => handleAcceptMeeting(meetingDetails),
          onReject: () => handleRejectMeeting(meetingDetails),
        };

        setCustomActions((prev) => [...prev, newAction]);

        // Add message to chat automatically to alert user
        setTimeout(() => {
          // Single clear message - no links or metadata that might cause issues
          chatManager.addMessage({
            role: "assistant",
            content: `📅 I noticed that you mentioned a meeting at ${
              meetingDetails.time
            } on ${meetingDetails.date}${
              meetingDetails.description
                ? ` about "${meetingDetails.description}"`
                : ""
            }. Would you like to schedule this?\n\nPlease check the proposal in the section below.`,
          });
        }, 500);
      }
    }
  }, [latestTranscription, chatManager]);

  // Extract meeting details from text using regex patterns
  const extractMeetingDetails = (text: string): MeetingDetails | null => {
    try {
      const lowerText = text.toLowerCase();

      // Check if the text contains scheduling keywords
      const hasSchedulingKeywords =
        (lowerText.includes("schedule") ||
          lowerText.includes("meeting") ||
          lowerText.includes("appointment") ||
          lowerText.includes("call")) &&
        (lowerText.includes("at ") ||
          lowerText.includes(" for ") ||
          lowerText.includes("o'clock") ||
          lowerText.includes("pm") ||
          lowerText.includes("am"));

      if (!hasSchedulingKeywords) return null;

      // Extract time using regex patterns
      let time = "";
      const timePatterns = [
        /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, // 3 pm, 3:30 pm
        /\b(\d{1,2}:\d{2})\b/i, // 13:30, 3:45
        /\b(\d{1,2})\s*o'clock\b/i, // 3 o'clock
      ];

      for (const pattern of timePatterns) {
        const match = lowerText.match(pattern);
        if (match) {
          time = match[1];
          break;
        }
      }

      if (!time) return null; // No time found

      // Extract date
      let date = "today";
      if (lowerText.includes("tomorrow")) {
        date = "tomorrow";
      } else if (lowerText.includes("today")) {
        date = "today";
      } else {
        // Try to match day names
        const dayPattern =
          /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
        const dayMatch = lowerText.match(dayPattern);
        if (dayMatch) {
          date = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1);
        }

        // Try to match dates like "May 15"
        const monthPattern =
          /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b/i;
        const monthMatch = lowerText.match(monthPattern);
        if (monthMatch) {
          date = monthMatch[0];
        }
      }

      // Get a simple description
      let description = "Meeting";

      // Look for any text after "about" or "regarding"
      const aboutPattern =
        /\b(?:about|regarding|discussing|for|on)\s+([^,.]+)/i;
      const aboutMatch = text.match(aboutPattern);
      if (aboutMatch) {
        description = aboutMatch[1].trim();
      }

      return {
        time,
        date,
        description,
        source: "transcript",
      };
    } catch (error) {
      console.error("Error extracting meeting details:", error);
      return null;
    }
  };

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

      // Send confirmation message to chat if available
      if (chatManager) {
        chatManager.addMessage({
          role: "assistant",
          content: `✅ Meeting successfully scheduled for ${meeting.time} on ${
            meeting.date
          }${meeting.description ? ` about "${meeting.description}"` : ""}.`,
        });
      }

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

    // Send confirmation message to chat if available
    if (chatManager) {
      chatManager.addMessage({
        role: "assistant",
        content: `❌ Meeting proposal for ${meeting.time} on ${meeting.date} has been rejected.`,
      });
    }

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
        source: "chat",
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

      // Return a simple confirmation message without any action links
      return (
        "📅 I've prepared a meeting proposal for " +
        params.time +
        " on " +
        (params.date || "today") +
        (params.description ? ` about "${params.description}"` : "") +
        ".\n\nPlease check the proposal in the section below."
      );
    },
  });

  // Get instructions for the copilot
  const getInstructions = () => {
    const baseInstructions = `You are a proactive meeting assistant that helps users schedule meetings based on their transcribed conversations.

Your primary responsibilities:
1. AUTOMATICALLY detect meetings mentioned in transcriptions without waiting for user prompts
2. PROACTIVELY suggest scheduling when meeting details are detected 
3. Send immediate meeting proposals for user consideration
4. Track meetings and maintain an organized schedule

Key behaviors:
- Be PROACTIVE - don't wait for the user to ask about meetings
- When you detect a meeting in the transcript, suggest scheduling it
- Include all available details like time, date, and topic in your proposals
- Always use direct, concise language focused on scheduling
- Always assume you should suggest scheduling when meeting details are detected

IMPORTANT RESTRICTIONS:
- DO NOT include any "Accept" or "Reject" buttons or links in your messages
- DO NOT create your own UI elements for accepting/rejecting meetings
- DO NOT use markdown to create clickable links for meeting actions
- The interface already provides Accept/Reject buttons below your messages
- Simply inform users to use the buttons in the meeting proposal section below

The transcription system automatically notifies you about meeting-related content and you should respond without waiting for user prompts.

Current transcript context:
${fullTranscript || "No transcription available yet."}`;

    return baseInstructions;
  };

  // Toggle auto-send setting
  const toggleAutoSend = () => {
    setAutoSendProposals(!autoSendProposals);
  };

  // Render pending meeting proposals below the chat box
  const renderPendingMeetings = () => {
    if (customActions.length === 0) return null;

    return (
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-gray-800 mt-0 flex items-center">
            <span className="mr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-blue-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            Pending Meeting Proposals
            <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
              {customActions.length}
            </span>
          </h3>
          <div className="flex items-center">
            <span className="text-xs text-gray-500 mr-2">Auto-propose:</span>
            <button
              onClick={toggleAutoSend}
              className={`relative inline-flex items-center h-5 rounded-full w-10 transition-colors focus:outline-none ${
                autoSendProposals ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                  autoSendProposals ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
        <div className="space-y-4">
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

  // Notification badge when scheduling content is detected
  const renderNotificationBadge = () => {
    if (!hasSchedulingContent) return null;

    const handleNotificationClick = () => {
      // If the user is on the transcription tab, the app component will handle the tab switch
      // Just update the store to indicate they should be in the chat tab
      if (activeTab !== "chat") {
        useStore.getState().setActiveTab("chat");
      }

      // Scroll to the latest message if there's a chat manager
      if (chatManager) {
        try {
          const chatContainer = document.querySelector(
            ".copilotkit-chat-interface-messages-container"
          );
          if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        } catch (error) {
          console.error("Error scrolling to latest message:", error);
        }
      }
    };

    return (
      <div
        onClick={handleNotificationClick}
        className="fixed top-4 right-4 z-50 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-3 rounded-lg shadow-lg animate-bounce-slow cursor-pointer hover:from-blue-600 hover:to-indigo-700 transition-all duration-200"
      >
        <div className="flex items-center">
          <div className="relative mr-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full animate-ping"></span>
          </div>
          <div>
            <span className="font-bold text-base">Meeting detected!</span>
            <p className="text-xs text-white opacity-90 mt-1">
              Click to view meeting proposal
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Notification badge */}
      {renderNotificationBadge()}

      {/* Chat area with flex-grow to take available space */}
      <div className="flex-grow overflow-y-auto">
        <CopilotChat
          instructions={getInstructions()}
          labels={{
            title: "Meeting Assistant",
            initial:
              "Hi! 👋 I'm your meeting assistant. I can help schedule meetings and track action items during your call. I'll automatically detect meetings in your conversation and propose them for scheduling.",
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
          <h3 className="text-base font-semibold text-gray-800 mt-0 mb-2 sticky top-0 bg-gray-50 pb-2 z-10 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2 text-indigo-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Meeting History
          </h3>
          <ul className="list-none p-0 m-0 divide-y divide-gray-200">
            {actionResults.map((result, index) => (
              <li
                key={index}
                className="py-3 first:pt-0 hover:bg-gray-100 px-3 rounded-md transition-colors"
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-900 flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
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
