import { create } from "zustand";

// Types for the store state
interface AppState {
  // Transcription
  latestTranscription: string;
  fullTranscript: string;

  // Tools
  pendingTool: {
    toolName: string;
    parameters: Record<string, any>;
  } | null;

  // Action results
  actionResults: Array<{
    action: any;
    result?: any;
    error?: string;
    timestamp: string;
  }>;

  // UI state - notifications appear in the tab the user is NOT currently viewing
  activeTab: "chat" | "transcription";
  hasNewTranscription: boolean; // Now indicates if there's new transcription the CHAT tab should show
  hasNewAction: boolean; // Indicates if there's action that the Transcription tab should show
  hasSchedulingProposal: boolean;

  // Actions
  updateTranscription: (data: { text: string; fullTranscript: string }) => void;
  proposeTool: (data: {
    toolName: string;
    parameters: Record<string, any>;
  }) => void;
  addActionResult: (result: {
    action: any;
    result?: any;
    error?: string;
  }) => void;
  clearActionResults: () => void;

  // UI state actions
  setActiveTab: (tab: "chat" | "transcription") => void;
  resetNotifications: (forTab: "chat" | "transcription") => void;
}

// Create the store
const useStore = create<AppState>((set) => ({
  // Initial state
  latestTranscription: "",
  fullTranscript: "",
  pendingTool: null,
  actionResults: [],
  activeTab: "chat",
  hasNewTranscription: false,
  hasNewAction: false,
  hasSchedulingProposal: false,

  // Actions
  updateTranscription: (data) =>
    set((state) => {
      // Check if this transcription has scheduling keywords to show notification in chat tab
      const text = data.text.toLowerCase();
      const hasSchedulingKeywords =
        (text.includes("schedule") ||
          text.includes("meeting") ||
          text.includes("appointment")) &&
        (text.includes("at ") ||
          text.includes(" for ") ||
          text.includes("o'clock") ||
          text.includes("pm") ||
          text.includes("am") ||
          /\d+(:\d+)?/.test(text));

      return {
        latestTranscription: data.text,
        fullTranscript:
          data.fullTranscript || state.fullTranscript + "\n" + data.text,
        // Add notification to the chat tab if there are scheduling keywords
        // and the user is not currently on the chat tab
        hasNewTranscription:
          state.activeTab !== "chat" ? false : state.hasNewTranscription,
        hasNewAction:
          state.activeTab !== "transcription" && hasSchedulingKeywords
            ? true
            : state.hasNewAction,
      };
    }),

  proposeTool: (data) =>
    set((state) => {
      const isScheduling = data.toolName === "scheduleAppointment";
      return {
        pendingTool: data,
        // Only show notification if user is not on the chat tab
        hasNewAction: state.activeTab !== "chat",
        hasSchedulingProposal: isScheduling
          ? state.activeTab !== "chat"
          : state.hasSchedulingProposal,
      };
    }),

  addActionResult: (result) =>
    set((state) => ({
      actionResults: [
        ...state.actionResults,
        { ...result, timestamp: new Date().toISOString() },
      ],
      pendingTool: null,
      // Only show notification if user is not on the chat tab
      hasNewAction: state.activeTab !== "chat",
      hasSchedulingProposal: false,
    })),

  clearActionResults: () => set({ actionResults: [] }),

  // UI state actions
  setActiveTab: (tab) =>
    set((state) => ({
      activeTab: tab,
      // Clear notifications for the tab the user is now viewing
      hasNewTranscription:
        tab === "transcription" ? false : state.hasNewTranscription,
      hasNewAction: tab === "chat" ? false : state.hasNewAction,
      hasSchedulingProposal:
        tab === "chat" ? false : state.hasSchedulingProposal,
    })),

  resetNotifications: (forTab) => {
    if (forTab === "chat") {
      set({ hasNewAction: false, hasSchedulingProposal: false });
    } else {
      set({ hasNewTranscription: false });
    }
  },
}));

export default useStore;
