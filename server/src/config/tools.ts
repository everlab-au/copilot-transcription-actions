import { AppointmentParams, AppointmentResponse } from "../types/index.js";

export const scheduleAppointmentTool = {
  name: "scheduleAppointment",
  description: "Schedule an appointment at a specific time",
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

export const scheduleAppointment = async (
  params: AppointmentParams
): Promise<AppointmentResponse> => {
  console.log(
    `Appointment scheduled for ${params.time}${
      params.date ? ` on ${params.date}` : ""
    }`
  );
  console.log(
    `Description: ${params.description || "No description provided"}`
  );

  return {
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
};
