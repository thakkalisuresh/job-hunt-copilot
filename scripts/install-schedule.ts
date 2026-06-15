/**
 * Generate macOS launchd plists that run npm scripts on a schedule.
 *
 *   npm run install-schedule                 # refresh-feed, daily at 8:00am
 *   npm run install-schedule -- 7 30         # refresh-feed, daily at 7:30am
 *   npm run install-schedule -- poll-gmail   # poll-gmail, every 30 minutes
 *   npm run install-schedule -- poll-gmail 15 # poll-gmail, every 15 minutes
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
};

function buildPlist(opts: {
  label: string;
  npmScript: string;
  logPath: string;
  projectDir: string;
  npmPath: string;
  nodeBinDir: string;
  schedule: string; // pre-rendered <key>...</key> block(s)
}): string {
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
    <string>${opts.nodeBinDir}:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
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

  if (jobName === "poll-gmail") {
    const minutes = Number(
      (firstArg === "poll-gmail" ? process.argv[3] : process.argv[2]) ?? 30
    );
    const seconds = minutes * 60;
    schedule = `  <key>StartInterval</key>\n  <integer>${seconds}</integer>\n`;
    scheduleDescription = `every ${minutes} minute(s)`;
  } else {
    const hour = Number(process.argv[2] ?? 8);
    const minute = Number(process.argv[3] ?? 0);
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
