export interface AppointmentParams {
  time: string;
  date?: string;
  description?: string;
}

export interface AppointmentResponse {
  success: boolean;
  message: string;
  appointmentDetails: {
    time: string;
    date: string;
    description: string;
  };
}
