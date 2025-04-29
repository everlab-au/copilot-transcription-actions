import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { scheduleAppointmentTool } from "./tools/scheduler.js";

/**
 * Initialize and start the MCP server
 */
export async function startMCPServer() {
  // Create an MCP server
  const server = new Server(
    {
      name: "meeting-assistant-mcp-server",
      version: "0.0.1",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register the tools list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [scheduleAppointmentTool],
    };
  });

  // Register the tool call handler
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      try {
        if (!request.params.arguments) {
          throw new Error("Arguments are required");
        }

        switch (request.params.name) {
          case "scheduleAppointment": {
            const { time, date, description } = request.params.arguments as any;

            if (!time) {
              throw new Error("Time is required for scheduling an appointment");
            }

            console.log(
              `Scheduling appointment for ${time}${date ? ` on ${date}` : ""}`
            );
            console.log(
              `Description: ${description || "No description provided"}`
            );

            const result = {
              success: true,
              message: `Appointment scheduled for ${time}${
                date ? ` on ${date}` : ""
              }`,
              appointmentDetails: {
                time,
                date: date || "today",
                description: description || "No description provided",
              },
            };

            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error("Error executing tool:", error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    }
  );

  // Start the server using stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("MCP Server running on stdio");
}
