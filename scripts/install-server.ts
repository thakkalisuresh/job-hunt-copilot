/**
 * Generate a macOS launchd plist that keeps the Job Hunt Copilot web server
 * running all the time (production `next start`, bound to all interfaces so it's
 * reachable over LAN / Tailscale, not just localhost).
 *
 *   npm run install-server          # serve on port 3000
 *   npm run install-server -- 4000  # serve on port 4000
 *
 * Unlike the scheduled jobs, this is a long-running daemon: RunAtLoad=true (start
 * on login) + KeepAlive=true (restart if it crashes).
 *
 * Like install-schedule, this only WRITES the plist and prints the commands you
 * run yourself — it never touches ~/Library/LaunchAgents or calls launchctl.
 *
 * Prerequisite: run `npm run build` first (and after any code change) — `next
 * start` serves the built output in .next/.
 */
import fs from "fs";
import path from "path";

function main() {
  const projectDir = process.cwd();
  const nodeBinDir = path.dirname(process.execPath);
  const npmPath = path.join(nodeBinDir, "npm");
  const port = Number(process.argv[2] ?? 3000);

  const label = "com.jobhuntcopilot.server";
  const logPath = path.join(projectDir, "data", "server.log");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npmPath}</string>
    <string>run</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${nodeBinDir}:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PORT</key>
    <string>${port}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;

  const outPath = path.join(projectDir, "scripts", `${label}.plist`);
  fs.writeFileSync(outPath, plist);

  const target = `~/Library/LaunchAgents/${label}.plist`;
  console.log(`Wrote ${outPath}`);
  console.log(`\nAlways-on web server: "npm run serve" on port ${port} (RunAtLoad + KeepAlive).\n`);
  console.log("First build the app, then install and load the service yourself:\n");
  console.log(`  npm run build`);
  console.log(`  cp "${outPath}" ${target}`);
  console.log(`  launchctl load ${target}\n`);
  console.log("If you currently run `npm run dev` by hand on this port, stop it first (it would conflict).\n");
  console.log("To stop/uninstall later:\n");
  console.log(`  launchctl unload ${target}`);
  console.log(`  rm ${target}\n`);
  console.log(`Logs: ${logPath}`);
}

main();
