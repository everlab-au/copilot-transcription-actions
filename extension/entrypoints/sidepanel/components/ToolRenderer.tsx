import {
  useCopilotAction,
  CatchAllActionRenderProps,
} from "@copilotkit/react-core";
import { useState, useEffect } from "react";
import useStore from "../utils/store";

interface ToolCallProps {
  status: string;
  name: string;
  args: any;
  result?: any;
}

// Component for displaying tool calls
const McpToolCall = ({ status, name, args, result }: ToolCallProps) => {
  const statusColors = {
    inProgress: "bg-blue-100 border-blue-300",
    executing: "bg-yellow-100 border-yellow-300",
    complete: "bg-green-100 border-green-300",
    error: "bg-red-100 border-red-300",
  };

  const statusColor =
    statusColors[status as keyof typeof statusColors] ||
    "bg-gray-100 border-gray-300";

  return (
    <div className={`p-3 mb-3 border rounded ${statusColor}`}>
      <div className="font-semibold text-sm mb-1">
        <span className="inline-block mr-2">{name}</span>
        <span className="text-xs px-2 py-1 rounded bg-gray-200">{status}</span>
      </div>

      <div className="text-xs">
        <div className="mb-2">
          <div className="font-medium">Arguments:</div>
          <pre className="p-2 bg-white/50 rounded overflow-x-auto">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>

        {result && (
          <div>
            <div className="font-medium">Result:</div>
            <pre className="p-2 bg-white/50 rounded overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

// Component to observe and render all tool calls
export function ToolRenderer() {
  const [toolCalls, setToolCalls] = useState<ToolCallProps[]>([]);

  // Get store actions
  const addActionResult = useStore((state) => state.addActionResult);

  console.log(
    "ToolRenderer rendering, with",
    toolCalls.length,
    "recorded tool calls"
  );

  // Log when MCP signals come in from backend
  useEffect(() => {
    console.log("ToolRenderer: Setting up connection to MCP server");
    return () => {
      console.log("ToolRenderer: Cleaning up MCP connection");
    };
  }, []);

  // Register a catch-all handler for any tool call
  useCopilotAction({
    name: "*",
    render: ({
      name,
      status,
      args,
      result,
    }: CatchAllActionRenderProps<any[]>) => {
      console.log(`MCP Tool Call: ${name} (${status})`, args);
      if (result) console.log(`MCP Tool Result:`, result);

      // Add this tool call to our state
      const toolCall = { name, status, args, result };
      setToolCalls((prev) => [...prev, toolCall]);

      // If it's a scheduling tool that's been completed, use Zustand store
      if (name === "scheduleAppointment" && status === "complete") {
        console.log(
          "Scheduling tool completed, updating store with ACTION_EXECUTED"
        );
        addActionResult({
          action: { name: "Schedule Appointment" },
          result,
        });
      }

      // Render the tool call
      return (
        <McpToolCall status={status} name={name} args={args} result={result} />
      );
    },
  });

  return null;
}

export default ToolRenderer;
