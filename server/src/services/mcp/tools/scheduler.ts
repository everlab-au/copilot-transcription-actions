/**
 * This file defines the scheduler tool for the MCP server
 */

/**
 * The scheduler tool definition for MCP
 */
export const scheduleAppointmentTool = {
  name: "scheduleAppointment",
  description: "Schedule an appointment or meeting at a specific time",
  parameters: {
    type: "object",
    properties: {
      time: {
        type: "string",
        description: 'The time for the appointment (e.g., "4pm", "14:30")',
      },
      date: {
        type: "string",
        description:
          'Optional date for the appointment (e.g., "tomorrow", "May 15")',
      },
      description: {
        type: "string",
        description: "Optional description of the appointment",
      },
    },
    required: ["time"],
  },
};
