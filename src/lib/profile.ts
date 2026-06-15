export interface ProfileData {
  targetRole: string;
  targetCompanies: string;
  workAuthorization: string;
  yearsExperience: string;
  education: string;
  links: string;
  salaryExpectation: string;
  noticePeriod: string;
  earliestStart: string;
  eeoDefaults: string;
  references: string;
}

export const EMPTY_PROFILE: ProfileData = {
  targetRole: "",
  targetCompanies: "",
  workAuthorization: "",
  yearsExperience: "",
  education: "",
  links: "",
  salaryExpectation: "",
  noticePeriod: "",
  earliestStart: "",
  eeoDefaults: "",
  references: "",
};
