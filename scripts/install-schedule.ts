/**
 * Generate macOS launchd plists that run npm scripts on a schedule.
 *
 *   npm run install-schedule                 # refresh-feed, daily at 8:00am
 *   npm run install-schedule -- 7 30         # refresh-feed, daily at 7:30am
 *   npm run install-schedule -- poll-gmail   # poll-gmail, every 30 minutes
 *   npm run install-schedule -- poll-gmail 15 # poll-gmail, every 15 minutes
 *   npm run install-schedule -- auto-tailor    # auto-tailor, every 30 minutes
 *   npm run install-schedule -- auto-tailor 15 # auto-tailor, every 15 minutes
 *
 * This only WRITES the plist into the project (scripts/) and prints the two
 * commands you run yourself to install and load it — it never touches
 * ~/Library/LaunchAgents or calls launchctl on your behalf.
 */
import fs from "fs";
import path from "path";

interface JobConfig {
  label: string;
  npmScript: string;
  logFile: string;
  extraEnv?: Record<string, string>;
}

const JOBS: Record<string, JobConfig> = {
  "refresh-feed": {
    label: "com.jobhuntcopilot.refresh",
    npmScript: "refresh-feed",
    logFile: "refresh.log",
  },
  "poll-gmail": {
    label: "com.jobhuntcopilot.pollgmail",
    npmScript: "poll-gmail",
    logFile: "poll-gmail.log",
  },
  "auto-tailor": {
    label: "com.jobhuntcopilot.autotailor",
    npmScript: "auto-tailor",
    logFile: "auto-tailor.log",
  },
  "refresh-open-jobs": {
    label: "com.jobhuntcopilot.refreshopenjobs",
    npmScript: "refresh-open-jobs",
    logFile: "refresh-open-jobs.log",
    // Push the refreshed DB to the live Fly machine after each run.
    extraEnv: { OPEN_JOBS_PUSH_TO_FLY: "1" },
  },
};

/** Jobs scheduled by interval (every N minutes) rather than a daily time-of-day. */
const INTERVAL_JOBS = new Set(["poll-gmail", "auto-tailor"]);

/** Jobs scheduled weekly (a specific weekday + time) rather than daily. The
 *  open-jobs bulk refresh re-downloads ~20 GB, so daily would be wasteful — the
 *  light sources in refresh-feed keep the feed fresh day to day. */
const WEEKLY_JOBS = new Set(["refresh-open-jobs"]);

function buildPlist(opts: {
  label: string;
  npmScript: string;
  logPath: string;
  projectDir: string;
  npmPath: string;
  nodeBinDir: string;
  schedule: string; // pre-rendered <key>...</key> block(s)
  extraEnv?: Record<string, string>;
}): string {
  const flyBinDir = path.join(process.env.HOME || "", ".fly", "bin");
  const extraEnvXml = Object.entries(opts.extraEnv ?? {})
    .map(([k, v]) => `    <key>${k}</key>\n    <string>${v}</string>\n`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${opts.label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.npmPath}</string>
    <string>run</string>
    <string>${opts.npmScript}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${opts.projectDir}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${opts.nodeBinDir}:${flyBinDir}:/usr/bin:/bin:/usr/sbin:/sbin</string>
${extraEnvXml}  </dict>
${opts.schedule}  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${opts.logPath}</string>
  <key>StandardErrorPath</key>
  <string>${opts.logPath}</string>
</dict>
</plist>
`;
}

function main() {
  const projectDir = process.cwd();
  const nodeBinDir = path.dirname(process.execPath);
  const npmPath = path.join(nodeBinDir, "npm");

  const firstArg = process.argv[2];
  const jobName = firstArg && JOBS[firstArg] ? firstArg : "refresh-feed";
  const job = JOBS[jobName];
  const logPath = path.join(projectDir, "data", job.logFile);

  let schedule: string;
  let scheduleDescription: string;

  if (WEEKLY_JOBS.has(jobName)) {
    // args after the job name: [weekday] [hour] [minute]; default Sunday 06:00
    const named = firstArg === jobName;
    const weekday = Number((named ? process.argv[3] : process.argv[2]) ?? 0); // 0 = Sunday
    const hour = Number((named ? process.argv[4] : process.argv[3]) ?? 6);
    const minute = Number((named ? process.argv[5] : process.argv[4]) ?? 0);
    schedule =
      `  <key>StartCalendarInterval</key>\n  <dict>\n` +
      `    <key>Weekday</key>\n    <integer>${weekday}</integer>\n` +
      `    <key>Hour</key>\n    <integer>${hour}</integer>\n` +
      `    <key>Minute</key>\n    <integer>${minute}</integer>\n  </dict>\n`;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    scheduleDescription = `weekly on ${days[weekday] ?? `weekday ${weekday}`} at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  } else if (INTERVAL_JOBS.has(jobName)) {
    const minutes = Number(
      (firstArg === jobName ? process.argv[3] : process.argv[2]) ?? 30
    );
    const seconds = minutes * 60;
    schedule = `  <key>StartInterval</key>\n  <integer>${seconds}</integer>\n`;
    scheduleDescription = `every ${minutes} minute(s)`;
  } else {
    // Skip the job-name arg if it was given (e.g. `-- refresh-open-jobs 6 0`),
    // same convention the interval branch uses for its minutes arg.
    const hourArg = firstArg === jobName ? process.argv[3] : process.argv[2];
    const minuteArg = firstArg === jobName ? process.argv[4] : process.argv[3];
    const hour = Number(hourArg ?? 8);
    const minute = Number(minuteArg ?? 0);
    schedule = `  <key>StartCalendarInterval</key>\n  <dict>\n    <key>Hour</key>\n    <integer>${hour}</integer>\n    <key>Minute</key>\n    <integer>${minute}</integer>\n  </dict>\n`;
    scheduleDescription = `daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const plist = buildPlist({
    label: job.label,
    npmScript: job.npmScript,
    logPath,
    projectDir,
    npmPath,
    nodeBinDir,
    schedule,
    extraEnv: job.extraEnv,
  });

  const outPath = path.join(projectDir, "scripts", `${job.label}.plist`);
  fs.writeFileSync(outPath, plist);

  const target = `~/Library/LaunchAgents/${job.label}.plist`;
  console.log(`Wrote ${outPath}`);
  console.log(`\nScheduled "npm run ${job.npmScript}" ${scheduleDescription}.\n`);
  console.log("To install and start it, run these yourself:\n");
  console.log(`  cp "${outPath}" ${target}`);
  console.log(`  launchctl load ${target}\n`);
  console.log("To stop/uninstall later:\n");
  console.log(`  launchctl unload ${target}`);
  console.log(`  rm ${target}\n`);
  console.log(`Logs will be written to ${logPath}`);
}

main();
