import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  CopilotRuntime,
  AnthropicAdapter,
  type AnthropicAdapterParams,
  copilotRuntimeNodeHttpEndpoint,
} from "@copilotkit/runtime";
import {
  scheduleAppointmentTool,
  scheduleAppointment,
} from "./config/tools.js";
import { startMCPServer } from "./services/mcp/index.js";

// Load environment variables
dotenv.config();

// Initialize MCP server if enabled
if (process.env.ENABLE_MCP_SERVER === "true") {
  try {
    startMCPServer().catch((error) =>
      console.error("Failed to start MCP server:", error)
    );
    console.log("MCP Server initialization started");
  } catch (error) {
    console.error("Error initializing MCP server:", error);
  }
}

// Create the express app
const app = express();

// Add CORS middleware
app.use(cors());
app.use(express.json());

// Configure Anthropic adapter with API key
const serviceAdapter = new AnthropicAdapter({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
} as AnthropicAdapterParams);

// Set up CopilotKit runtime endpoint
app.use("/copilotkit", (req, res, next) => {
  (async () => {
    const runtime = new CopilotRuntime({
      // MCP configuration
      actions: [
        {
          name: scheduleAppointmentTool.name,
          description: scheduleAppointmentTool.description,
          handler: (args: { [key: string]: any }) => {
            return scheduleAppointment({
              time: args.time as string,
              date: args.date as string,
              description: args.description as string,
            });
          },
          parameters: [
            {
              name: "time",
              type: "string",
              description:
                'The time for the appointment (e.g., "4pm", "14:30")',
              required: true,
            },
            {
              name: "date",
              type: "string",
              description:
                'Optional date for the appointment (e.g., "tomorrow", "May 15")',
              required: false,
            },
            {
              name: "description",
              type: "string",
              description: "Optional description of the appointment",
              required: false,
            },
          ],
        },
      ],
    });

    const handler = copilotRuntimeNodeHttpEndpoint({
      endpoint: "/copilotkit",
      runtime,
      serviceAdapter,
    });

    return handler(req, res);
  })().catch(next);
});

// Return available MCP tools (for external consumption)
app.get("/tools", (req, res) => {
  res.json({
    tools: [scheduleAppointmentTool],
  });
});

// Basic health check endpoint
app.get("/", (req, res) => {
  res.send("CopilotKit MCP Server is running with Anthropic");
});

// Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/copilotkit`);
});
