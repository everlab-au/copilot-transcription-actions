import { create } from "zustand";

// Types for the store state
interface AppState {
  // Transcription
  latestTranscription: string;
  fullTranscript: string;

  // Action results
  actionResults: Array<{
    action: any;
    result?: any;
    error?: string;
    timestamp: string;
  }>;

  // UI state - notifications appear in the tab the user is NOT currently viewing
  activeTab: "chat" | "transcription";
  hasNewTranscription: boolean; // Indicates if there's new transcription while user is on chat tab
  hasNewAction: boolean; // Indicates if there's new action while user is on transcription tab

  // Actions
  updateTranscription: (data: { text: string; fullTranscript: string }) => void;
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
  actionResults: [],
  activeTab: "chat",
  hasNewTranscription: false,
  hasNewAction: false,

  // Actions
  updateTranscription: (data) =>
    set((state) => {
      return {
        latestTranscription: data.text,
        fullTranscript:
          data.fullTranscript || state.fullTranscript + "\n" + data.text,
        // Only show notification if user is not on the transcription tab
        hasNewTranscription: state.activeTab !== "transcription",
      };
    }),

  addActionResult: (result) =>
    set((state) => ({
      actionResults: [
        ...state.actionResults,
        { ...result, timestamp: new Date().toISOString() },
      ],
      // Notify if user is not on the chat tab
      hasNewAction: state.activeTab !== "chat",
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
    })),

  resetNotifications: (forTab) => {
    if (forTab === "chat") {
      set({ hasNewAction: false });
    } else {
      set({ hasNewTranscription: false });
    }
  },
}));

export default useStore;
