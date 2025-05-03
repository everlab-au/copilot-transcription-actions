import { useState, useEffect } from "react";
import wxtLogo from "/wxt.svg";
import { CopilotKit } from "@copilotkit/react-core";
import ChatTab from "./components/ChatTab";
import TranscriptionTab from "./components/TranscriptionTab";
import ToolRenderer from "./components/ToolRenderer";
import useMcpConnection from "./hooks/useMcpConnection";
import useStore from "./utils/store";
// MCP server URL
const MCP_SERVER_URL = "http://localhost:4000/copilotkit";

function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "transcription">("chat");

  // Access Zustand store state
  const hasNewTranscription = useStore((state) => state.hasNewTranscription);
  const hasNewAction = useStore((state) => state.hasNewAction);
  const hasSchedulingContent = useStore((state) => state.hasSchedulingContent);
  const storeSetActiveTab = useStore((state) => state.setActiveTab);

  // Check MCP server connection
  const mcpStatus = useMcpConnection(MCP_SERVER_URL);

  // Log when component mounts to verify initialization
  useEffect(() => {
    console.log("App: Initializing with CopilotKit and MCP...");

    // Log MCP connection status changes
    if (mcpStatus.isConnected) {
      console.log("MCP Server is connected and ready");
    } else if (mcpStatus.error) {
      console.error("MCP Server connection error:", mcpStatus.error);
    }
  }, [mcpStatus.isConnected, mcpStatus.error]);

  // Handle tab changes
  const handleTabChange = (tab: "chat" | "transcription") => {
    console.log("App: Changing tab to", tab);
    setActiveTab(tab);

    // Update store's active tab state
    storeSetActiveTab(tab);
  };

  return (
    <CopilotKit runtimeUrl={MCP_SERVER_URL}>
      <ToolRenderer />
      <div className="flex flex-col h-screen max-w-full overflow-hidden">
        <div className="flex items-center px-4 py-2 bg-white border-b border-gray-200 h-15">
          <img
            src={wxtLogo}
            className="h-5 mr-2 animate-pulse hover:animate-none"
            alt="WXT logo"
          />
          <div className="flex flex-col ml-2">
            <h1 className="text-lg font-semibold">Welcome!</h1>
            <p className="text-sm text-gray-500 transition-all hover:text-indigo-500">
              Your AI meeting assistant
            </p>
          </div>
          <div className="ml-auto flex items-center">
            {/* MCP Status Indicator */}
            <div
              className={`px-2 py-1 rounded text-xs mr-2 ${
                mcpStatus.isConnected
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              MCP: {mcpStatus.isConnected ? "Connected" : "Disconnected"}
            </div>
          </div>
        </div>

        <div className="flex border-b border-gray-200 bg-white">
          <div
            className={`px-4 py-3 cursor-pointer border-b-2 font-medium relative ${
              activeTab === "chat"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent"
            } ${
              hasNewAction || (hasSchedulingContent && activeTab !== "chat")
                ? "animate-pulse-tab"
                : ""
            }`}
            onClick={() => handleTabChange("chat")}
          >
            Chat
            {hasNewAction && (
              <span className="inline-flex items-center justify-center absolute -top-1 -right-1 h-5 w-5 text-xs bg-red-500 text-white rounded-full shadow-sm animate-pulse">
                !
              </span>
            )}
            {hasSchedulingContent && !hasNewAction && activeTab !== "chat" && (
              <div className="absolute -top-1 -right-1">
                <span className="inline-flex items-center justify-center h-5 w-5 text-xs bg-blue-500 text-white rounded-full shadow-sm animate-pulse">
                  📅
                </span>
                <span className="absolute top-0 right-0 h-full w-full bg-blue-400 rounded-full animate-ping opacity-75"></span>
              </div>
            )}
          </div>
          <div
            className={`px-4 py-3 cursor-pointer border-b-2 font-medium relative ${
              activeTab === "transcription"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent"
            } ${hasNewTranscription ? "animate-pulse-tab bg-blue-50" : ""}`}
            onClick={() => handleTabChange("transcription")}
          >
            Transcription
            {hasNewTranscription && (
              <span className="inline-flex items-center justify-center absolute -top-1 -right-1 h-5 w-5 text-xs bg-blue-500 text-white rounded-full shadow-sm animate-pulse">
                !
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden h-[calc(100vh-7.5rem)]">
          {activeTab === "chat" && <ChatTab />}
          {activeTab === "transcription" && <TranscriptionTab />}
        </div>
      </div>
    </CopilotKit>
  );
}

export default App;
