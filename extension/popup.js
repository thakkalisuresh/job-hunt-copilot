const API = "http://localhost:3000";

const statusEl = document.getElementById("status");
function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = cls || "";
}

/** Classify a URL into a known link type. */
function classifyLink(url) {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("github.com")) return "github";
  return "portfolio";
}

/** Build a flat field dictionary from the app's resume + profile. */
async function buildFields() {
  const [resumeRes, profileRes] = await Promise.all([
    fetch(`${API}/api/resume`),
    fetch(`${API}/api/profile`),
  ]);
  const resume = (await resumeRes.json()).resume;
  const profile = (await profileRes.json()).profile || {};

  const fields = {};
  const contact = resume?.data?.contact || {};
  if (contact.name) {
    fields.fullName = contact.name;
    const parts = contact.name.trim().split(/\s+/);
    fields.firstName = parts[0];
    fields.lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  }
  if (contact.email) fields.email = contact.email;
  if (contact.phone) fields.phone = contact.phone;
  if (contact.location) fields.location = contact.location;
  for (const link of contact.links || []) {
    fields[classifyLink(link)] = link;
  }

  // Profile links field may hold multiple URLs / lines.
  for (const token of String(profile.links || "").split(/[\s,]+/)) {
    if (/^https?:\/\//.test(token)) {
      const k = classifyLink(token);
      if (!fields[k]) fields[k] = token;
    }
  }

  if (profile.workAuthorization) fields.workAuthorization = profile.workAuthorization;
  if (profile.yearsExperience) fields.yearsExperience = profile.yearsExperience;
  if (profile.salaryExpectation) fields.salaryExpectation = profile.salaryExpectation;
  if (profile.noticePeriod) fields.noticePeriod = profile.noticePeriod;
  if (profile.earliestStart) fields.earliestStart = profile.earliestStart;
  if (profile.references) fields.references = profile.references;
  if (profile.targetRole) fields.targetRole = profile.targetRole;

  return fields;
}

/**
 * Injected into the page. Scans form fields, fills the ones it can map from
 * `fields`, highlights filled (green) and likely-required-but-blank (orange).
 * Returns counts. Never submits anything.
 */
function autofillPage(fields) {
  // [regex tested against a field's combined label text, dictionary key]
  const PATTERNS = [
    [/first\s*name|given\s*name|fname/, "firstName"],
    [/last\s*name|family\s*name|surname|lname/, "lastName"],
    [/full\s*name|^name$|your\s*name|legal\s*name/, "fullName"],
    [/e-?mail/, "email"],
    [/phone|mobile|tel/, "phone"],
    [/linkedin/, "linkedin"],
    [/github/, "github"],
    [/portfolio|website|personal\s*site|url/, "portfolio"],
    [/(city|location|address|where.*based)/, "location"],
    [/(work\s*auth|authoriz|visa|sponsor|right to work|eligible to work)/, "workAuthorization"],
    [/(years|yrs).*exper|experience.*years/, "yearsExperience"],
    [/salary|compensation|desired pay|expected pay/, "salaryExpectation"],
    [/notice period|availability to start|when.*available/, "noticePeriod"],
    [/start date|earliest start|available start/, "earliestStart"],
    [/reference/, "references"],
    [/current title|desired role|position.*applying|role/, "targetRole"],
  ];

  function labelTextFor(el) {
    const bits = [];
    if (el.labels) for (const l of el.labels) bits.push(l.textContent || "");
    if (el.getAttribute("aria-label")) bits.push(el.getAttribute("aria-label"));
    if (el.getAttribute("placeholder")) bits.push(el.getAttribute("placeholder"));
    if (el.getAttribute("name")) bits.push(el.getAttribute("name"));
    if (el.id) bits.push(el.id);
    if (el.getAttribute("autocomplete")) bits.push(el.getAttribute("autocomplete"));
    // Nearby label without a for= association.
    const wrapLabel = el.closest("label");
    if (wrapLabel) bits.push(wrapLabel.textContent || "");
    return bits.join(" ").toLowerCase();
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSelect(el, value) {
    const v = value.toLowerCase();
    for (const opt of el.options) {
      const t = (opt.textContent || "").toLowerCase();
      if (t === v || opt.value.toLowerCase() === v || t.includes(v) || v.includes(t)) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  const elements = document.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select"
  );

  let filled = 0;
  let unmapped = 0;

  for (const el of elements) {
    if (el.disabled || el.readOnly) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue; // hidden

    const label = labelTextFor(el);
    let matchedKey = null;
    for (const [re, key] of PATTERNS) {
      if (re.test(label) && fields[key]) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      const value = fields[matchedKey];
      let ok = false;
      if (el.tagName === "SELECT") ok = fillSelect(el, value);
      else if (!el.value) {
        setNativeValue(el, value);
        ok = true;
      }
      if (ok) {
        el.style.outline = "2px solid #16a34a";
        filled++;
        continue;
      }
    }

    // Likely-required field we couldn't fill -> flag for manual review.
    const required = el.required || /\*/.test(label) || label.includes("required");
    if (required && !el.value) {
      el.style.outline = "2px solid #f59e0b";
      el.title = "Job Hunt Copilot: please fill this manually";
      unmapped++;
    }
  }

  return { filled, unmapped };
}

document.getElementById("autofill").addEventListener("click", async () => {
  setStatus("Reading your profile…");
  let fields;
  try {
    fields = await buildFields();
  } catch {
    setStatus("Couldn't reach the app. Is it running at localhost:3000?", "err");
    return;
  }
  if (Object.keys(fields).length === 0) {
    setStatus("No profile data found. Add your resume + profile in Setup first.", "err");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: autofillPage,
      args: [fields],
    });
    setStatus(
      `Filled ${result.filled} field(s) (green). ${result.unmapped} required field(s) left for you (orange).\nReview everything, then submit the form yourself.`,
      "ok"
    );
  } catch {
    setStatus("Couldn't autofill this page (it may block injected scripts).", "err");
  }
});

// --- Mark as applied ---
async function loadApplications() {
  const sel = document.getElementById("appSelect");
  try {
    const res = await fetch(`${API}/api/jobs`);
    const jobs = (await res.json()).jobs || [];
    const open = jobs.filter((j) => j.status !== "applied" && j.status !== "rejected");
    if (open.length === 0) {
      sel.innerHTML = '<option value="">No open applications</option>';
      return;
    }
    sel.innerHTML = open
      .map(
        (j) =>
          `<option value="${j.application_id}">${j.title} — ${j.company}</option>`
      )
      .join("");
  } catch {
    sel.innerHTML = '<option value="">App not reachable</option>';
  }
}

document.getElementById("markApplied").addEventListener("click", async () => {
  const id = document.getElementById("appSelect").value;
  if (!id) return;
  try {
    const res = await fetch(`${API}/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    if (res.ok) setStatus("Marked as applied.", "ok");
    else setStatus("Couldn't update the application.", "err");
    loadApplications();
  } catch {
    setStatus("App not reachable.", "err");
  }
});

loadApplications();
