/**
 * Seeds the user's real resume as the app's master resume (replacing any prior
 * master, e.g. the Priya Sharma mock) and regenerates the sample export files.
 *
 * Run from the project root:
 *   node --import tsx scripts/seed-my-resume.ts > /tmp/seed.log 2>&1
 *
 * The structured data below is the master copy. Edit it here to change what the
 * app stores and renders — never hand-edit the formatted PDF/DOCX (that breaks
 * the layout, which is the whole point of keeping the resume as structured data).
 */
import { writeFileSync } from "fs";
import Database from "better-sqlite3";
import { resumeToPdf, resumeToDocx } from "../src/lib/resume-render";
import type { ResumeData } from "../src/lib/resume";

const resume: ResumeData = {
  contact: {
    name: "Sabarish Nair",
    email: "nair.sabarish97@gmail.com",
    phone: "828-510-7202",
    location: "",
    links: [],
  },
  summary: "",
  // Reverse-chronological: in-progress UW Masters first.
  education: [
    { school: "University of Washington", degree: "Master of Science", field: "Business Analytics (in progress)", startDate: "2026", endDate: "2027", gpa: "" },
    { school: "Amity University", degree: "MBA", field: "", startDate: "2018", endDate: "2020", gpa: "8.2/10 CGPA" },
    { school: "SCMS School of Technology & Management", degree: "Bachelor of Commerce", field: "", startDate: "2015", endDate: "2018", gpa: "" },
  ],
  experience: [
    {
      title: "HR Analyst", company: "Amazon", location: "Bangalore, India", startDate: "Jan '24", endDate: "Mar '26",
      bullets: [
        "Acted as a strategic data partner by analyzing HR metrics, conducting thematic audits, and developing automated reporting solutions to drive operational efficiency. Collaborated cross-functionally with Business Intelligence and forecasting teams to optimize workforce allocation, mitigate compliance risks, and enhance data visibility for leadership",
        "Partnered with the forecasting team to strategically allocate advisors to fixed case types, optimizing back-office volume and reducing customer turnaround time (TAT) by **33% (from 72 to 48 hours)**",
        "Collaborated with the Business Intelligence team to migrate manual trackers into real-time, automated dashboards via QuickSuite and Smartsheet integrations, significantly enhancing leadership decision-making",
        "Integrated an AI-powered chat agent to analyze audit data and autonomously generate actionable recommendations, **saving 0.22 FTE hours** weekly in manager feedback delivery",
        // Trimmed for length (restore if needed): "Analyzed quality audit data to provide actionable insights into employee behavior, and driving process modifications that better aligned with evolving customer requirements",
        "Developed AI-based escalation alerting channel using bots to streamline how managers generate and deliver data-driven audit feedback to advisors",
        // Trimmed for length (restore if needed): "Managed interviewing and hiring for MHLS advisor positions to consistently meet departmental staffing demands",
      ],
    },
    {
      title: "HR Advisor III", company: "Amazon", location: "Bangalore, India", startDate: "Dec '21", endDate: "Jan '24",
      bullets: [
        "Served as a senior escalation point and process improvement lead, driving standardization and automation across HR operations. Partnered with leadership to overhaul ranking systems, resolve complex legal escalations, and engineer AI-driven solutions to reduce manual administrative burden for managers",
        "Architected internal AI applications to automate the documentation of abusive contacts for the escalations team, decreasing processing time by **75% (from 2 hours to 30 minutes)**",
        "Created a standardized \"Handling Legal Escalations SOP\" for the quality team, effectively reducing training time by **83% (from 2 hours to 20 minutes)** while improving compliance",
        "Co-authored a strategic proposal analyzing discrepancies in TQ and BQ advisor filtering, successfully prompting leadership to restructure the existing advisor ranking process",
        // Trimmed for length (restore if needed): "Executed thematic auditing alongside Quality and Operations leadership regarding NY PTO, identifying critical process gaps and advisor behavior trends to resolve systemic workflow concerns",
        "Partnered strategically with the Learning and Development team to audit and transition core operational processes into the Essential Skills framework, ensuring standardized training delivery across the department",
      ],
    },
    {
      title: "HR Advisor II", company: "Amazon", location: "Bangalore, India", startDate: "Nov '20", endDate: "Nov '21",
      bullets: [
        "Provided comprehensive HR support by resolving operational roadblocks, mentoring junior associates, and facilitating full-cycle recruitment for advisor positions. Acted as a primary point of contact for cross-functional stakeholders, ensuring seamless communication, stakeholder relationship management, and adherence to foundational HR processes",
        "Spearheaded the inception of \"Team 360\" in August 2021, serving as the inaugural point of contact for operations and quality management while mentoring and training a cohort of **15+ associates**",
        // Trimmed for length (restore if needed): "Reduced end-to-end interviews and hiring for MHLS advisor positions to consistently meet departmental staffing demands",
        "Cultivated strong relationships with HRBPs, HR Partners, and Operations Leaders across multiple corporate sites to proactively address and resolve customer-facing issues",
        "Served as the primary point of contact for system access inquiries within the Quality Team, conducting root-cause analysis to resolve technical restraints and minimize operational downtime",
      ],
    },
    {
      title: "Business Development Associate", company: "Byju's", location: "Kochi, India", startDate: "Sep '20", endDate: "Oct '20",
      bullets: [
        "Assessing performance output via Achieve, CRM via LeadSquared, managed inventories through Orderhive & Arrieyo for Omni-channel Customer Care",
        "Handling payment gateway management & requirements of customer KYC documents for loans by Avanse & IIFL",
      ],
    },
    {
      title: "Financial Services Intern", company: "Geojit Financial Services", location: "Kochi, India", startDate: "June '19", endDate: "Aug '19",
      bullets: [
        "Facilitated equity analysis to assess quarterly results, balance sheets & PE ratio of **10-15** companies to put forth buy/sell recommendations",
        "Performed comprehensive market research to identify potential investment opportunities & used statistical tools i.e., RSI & SMA's to examine stocks",
        "Collated & verified KYC information of **20+** clients to create DEMAT accounts",
      ],
    },
  ],
  projects: [
    {
      name: "Effectiveness of Visual Merchandising", organization: "Amity University", date: "2020",
      bullets: [
        "Directed a mixed-methods research study for a major retail client, designing and deploying surveys to **100+** customers to evaluate the effectiveness of in-store visual merchandising",
        "Executed Factor Analysis in SPSS to model consumer behavior metrics, synthesizing raw data into actionable layout, pricing, and sensory recommendations for supermarket management",
        "Drove a **17% increase** in clearance product sales and improved quarterly profitability by successfully piloting a data-backed trial layout, which included revamped price displays and atmospheric enhancements",
      ],
    },
    {
      name: "Stock Price Analysis of SBI & HDFC Bank", organization: "Amity University", date: "2019",
      bullets: [
        "Engineered a multiple regression model using R to isolate and quantify the impact of microeconomic and macroeconomic variables on closing share prices",
        "Aggregated and cleansed a 5-year quarterly dataset, evaluating macroeconomic indicators (Bank NIFTY, Inflation, GDP) against micro-financial metrics (NPA, PAT, Deposits)",
        "Analyzed statistical outputs including R, R-squared, standard deviation, and Beta values to formulate data-driven findings on the fundamental drivers of stock valuations beyond baseline investor sentiment",
      ],
    },
  ],
  activities: [
    {
      title: "Core Team Member of TEDxAGBS", organization: "Amity Global Business School", date: "2019",
      bullets: [
        "Administered event with footfall of **150+** by delegating work effectively amongst **6** members",
        "Consolidated costs by **50%** & generated alternate solutions i.e., search of venue at lower price",
        "Led finance team of **6** members & handled payments for event including logistics, food & venue",
      ],
    },
    {
      title: "NSS Volunteer", organization: "SCMS School of Engineering and Technology", date: "2016 – '17",
      bullets: [
        "Led team of 55+ volunteers during undergrad",
        "Done over **60+** hours of volunteering at government hospitals, schools and senior care homes",
      ],
    },
    {
      title: "Volunteer for HVVP, Nepal & The Green Nest", organization: "", date: "2015",
      bullets: [
        "Spearheaded a sustainable disaster relief initiative for the 2015 Nepal earthquake, directing social media campaigns (Facebook/WhatsApp) that mobilized community support and secured endorsement from local government officials",
        "Recruited and led a **15-person** volunteer team over 3 days to collect, sort, and package **3.5 tons** of crucial supplies, including food, medicine, and clothing",
        "Coordinated end-to-end international logistics, negotiating free rail transport via DTDC and air transport via Air India to successfully deliver **16.5 tons of total aid (including 12,000 water bottles)** to Kathmandu",
      ],
    },
  ],
  skills: ["Power BI", "Advanced Excel", "IBM SPSS", "Microsoft Office"],
  certifications: [
    "Power BI (2020)",
    "Anti-Money Laundering Fundamentals (2020)",
    "Tally ERP 9 - Tally Education Ltd. (2018)",
    'IBM "Data Analyst Professional Certificate" (in progress)',
  ],
  awards: [
    "WoW Winner for PXT Amazon (2024, 2022 and 2021)",
    "Won Finance Quiz - Amity Global Business School (2019)",
    "Awarded Silver & Bronze, Standard International Award for Young People - Duke of Edinburgh (2012)",
  ],
  languages: ["English", "French (intermediate)", "Malayalam", "Hindi"],
};

async function main() {
  // 1. Persist as the master resume (replace any existing master).
  const db = new Database("data/app.db");
  const insert = db.prepare(
    "INSERT INTO resumes (job_id, is_master, content_json, raw_text) VALUES (NULL, 1, ?, ?)"
  );
  const result = insert.run(JSON.stringify(resume), "Seeded from scripts/seed-my-resume.ts");
  db.prepare("UPDATE resumes SET is_master = 0 WHERE id != ? AND job_id IS NULL").run(
    result.lastInsertRowid
  );
  db.close();

  // 2. Regenerate sample files from the same data.
  writeFileSync("samples/Sabarish_Nair_via_app.pdf", await resumeToPdf(resume));
  writeFileSync("samples/Sabarish_Nair_via_app.docx", await resumeToDocx(resume));

  console.log(
    `Master resume seeded (id ${result.lastInsertRowid}); ` +
      `${resume.education.length} education, ${resume.experience.length} experience. Samples regenerated.`
  );
}

main();
