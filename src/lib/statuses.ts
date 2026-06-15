/** Single source of truth for application (tracker) statuses / Kanban columns. */
export interface ApplicationStatus {
  key: string;
  label: string;
}

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  { key: "saved", label: "Saved" },
  { key: "tailoring", label: "Tailoring" },
  { key: "applied", label: "Applied" },
  { key: "interview_requested", label: "Interview requested" },
  { key: "interviewing", label: "Interviewing" },
  { key: "action_needed", label: "Action needed" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
];

/** Statuses at which a real interview is on the table (gates the Mock Interview step). */
export const INTERVIEW_STAGE_STATUSES = ["interview_requested", "interviewing", "offer"];

export function isInterviewStage(status: string): boolean {
  return INTERVIEW_STAGE_STATUSES.includes(status);
}
