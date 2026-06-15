"use client";

import { useEffect, useState, FormEvent, ChangeEvent, KeyboardEvent } from "react";
import { ResumeData } from "@/lib/resume";
import { ProfileData, EMPTY_PROFILE } from "@/lib/profile";

type ProfileField = {
  key: Exclude<keyof ProfileData, "targetCompanies">;
  label: string;
  multiline?: boolean;
  optional?: boolean;
  hint?: string;
};

// targetCompanies is rendered separately as a tag input.
const PROFILE_FIELDS: ProfileField[] = [
  { key: "targetRole", label: "Target role(s)" },
  { key: "workAuthorization", label: "Work authorization / visa status" },
  {
    key: "yearsExperience",
    label: "Years of experience",
    multiline: true,
    hint: "Overall + per key skill. Helps when a form asks for a specific number.",
  },
  {
    key: "salaryExpectation",
    label: "Salary expectations",
    optional: true,
    hint: "Leave blank to skip — only used if a form requires it.",
  },
  { key: "noticePeriod", label: "Notice period", optional: true },
  { key: "earliestStart", label: "Earliest start date", optional: true },
  {
    key: "links",
    label: "Links (LinkedIn, GitHub, portfolio)",
    multiline: true,
    optional: true,
    hint: "Auto-pulled from your resume if it has them. Add full URLs here only if they're not on your resume.",
  },
  {
    key: "education",
    label: "Education",
    multiline: true,
    optional: true,
    hint: "Usually already on your resume — only add if a form needs it separately.",
  },
  { key: "eeoDefaults", label: "EEO / demographic defaults", multiline: true, optional: true },
];

export default function SetupPage() {
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [resumeMeta, setResumeMeta] = useState<{ id: number; createdAt: string } | null>(null);
  const [resumeFit, setResumeFit] = useState<{ fitsOnePage: boolean; linesOver: number } | null>(
    null
  );
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/resume")
      .then((r) => r.json())
      .then((data) => {
        if (data.resume) {
          setResume(data.resume.data);
          setResumeMeta({ id: data.resume.id, createdAt: data.resume.createdAt });
          setResumeFit(data.resume.fit ?? null);
        }
      });
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => setProfile({ ...EMPTY_PROFILE, ...data.profile }));
    fetch("/api/feed")
      .then((r) => r.json())
      .then((data) => {
        const companies = Array.from(
          new Set((data.jobs || []).map((j: { company: string }) => j.company))
        ).sort() as string[];
        setCompanySuggestions(companies);
      })
      .catch(() => {});
  }, []);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/resume", { method: "POST", body: form });
    setUploading(false);
    const data = await res.json();
    if (!res.ok) {
      setUploadError(data.error || "Failed to parse resume");
      return;
    }
    setResume(data.resume.data);
    setResumeMeta({ id: data.resume.id, createdAt: new Date().toISOString() });
  }

  async function handlePasteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setUploading(true);
    setUploadError(null);
    const res = await fetch("/api/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pasteText }),
    });
    setUploading(false);
    const data = await res.json();
    if (!res.ok) {
      setUploadError(data.error || "Failed to parse resume");
      return;
    }
    setResume(data.resume.data);
    setResumeMeta({ id: data.resume.id, createdAt: new Date().toISOString() });
    setPasteText("");
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSaved(false);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setProfileSaving(false);
    if (res.ok) setProfileSaved(true);
  }

  const contact = resume?.contact;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-semibold">Setup</h1>
      <p className="mb-8 text-sm text-zinc-600">
        Upload your master resume and fill in your application profile once — both feed
        the Resume Lab and your application &ldquo;cheat sheet&rdquo;.
      </p>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Master resume</h2>

        {resume ? (
          <div className="mb-4 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="font-medium">{contact?.name || "(no name found)"}</p>
            {resumeFit && !resumeFit.fitsOnePage && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                ⚠️ Work Experience + Education run about{" "}
                <strong>
                  {resumeFit.linesOver} line{resumeFit.linesOver > 1 ? "s" : ""}
                </strong>{" "}
                onto page 2 of the apply-ready PDF. Trim or shorten a few bullets to bring
                them onto page 1.
              </p>
            )}
            <dl className="mt-2 grid grid-cols-1 gap-1 text-zinc-600 sm:grid-cols-2">
              {contact?.email && (
                <div>
                  <span className="text-zinc-400">Email: </span>
                  {contact.email}
                </div>
              )}
              {contact?.phone && (
                <div>
                  <span className="text-zinc-400">Phone: </span>
                  {contact.phone}
                </div>
              )}
              {contact?.location && (
                <div>
                  <span className="text-zinc-400">Location: </span>
                  {contact.location}
                </div>
              )}
              {contact?.links?.length ? (
                <div className="sm:col-span-2">
                  <span className="text-zinc-400">Links: </span>
                  {contact.links.join(", ")}
                </div>
              ) : null}
            </dl>
            <p className="mt-2 text-xs text-zinc-500">
              Name, email, phone &amp; location come from your resume and are what the autofill
              extension uses on application forms — no need to re-enter them below.
            </p>
            <p className="mt-2 text-zinc-600">
              {[
                `${resume.experience?.length || 0} role(s)`,
                resume.projects?.length ? `${resume.projects.length} project(s)` : null,
                `${resume.education?.length || 0} education`,
                `${resume.skills?.length || 0} skill(s)`,
                resume.certifications?.length ? `${resume.certifications.length} cert(s)` : null,
                resume.awards?.length ? `${resume.awards.length} award(s)` : null,
                resume.languages?.length ? `${resume.languages.length} language(s)` : null,
                resume.activities?.length ? `${resume.activities.length} activity(ies)` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {resumeMeta && (
              <p className="mt-1 text-xs text-zinc-400">
                Parsed {new Date(resumeMeta.createdAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <p className="mb-4 text-sm text-zinc-500">No master resume uploaded yet.</p>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Upload PDF, DOCX, or text file
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm"
          />
        </div>

        <form onSubmit={handlePasteSubmit} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-zinc-600">
            Or paste your resume text
          </label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
            placeholder="Paste resume text here…"
          />
          <button
            type="submit"
            disabled={uploading || !pasteText.trim()}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {uploading ? "Parsing…" : "Parse & save"}
          </button>
        </form>

        {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-medium">Application profile</h2>
        <p className="mb-4 text-sm text-zinc-600">
          The recurring details application forms ask for that{" "}
          <em>aren&rsquo;t</em>{" "}
          on your resume. Nothing here is required — fill in what&rsquo;s useful and
          skip the rest.
        </p>
        <form onSubmit={handleProfileSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-zinc-600">Target companies</label>
            <TagInput
              value={profile.targetCompanies}
              onChange={(v) => setProfile((p) => ({ ...p, targetCompanies: v }))}
              suggestions={companySuggestions}
            />
            <p className="text-xs text-zinc-400">
              Type a name and press Enter, or pick from companies in your Job Feed.
            </p>
          </div>

          {PROFILE_FIELDS.map((field) => (
            <div
              key={field.key}
              className={`flex flex-col gap-1 ${field.multiline ? "sm:col-span-2" : ""}`}
            >
              <label className="text-xs font-medium text-zinc-600">
                {field.label}
                {field.optional && (
                  <span className="ml-1 font-normal text-zinc-400">(optional)</span>
                )}
              </label>
              {field.multiline ? (
                <textarea
                  value={profile[field.key]}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, [field.key]: e.target.value }))
                  }
                  rows={3}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              ) : (
                <input
                  value={profile[field.key]}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, [field.key]: e.target.value }))
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              )}
              {field.hint && <p className="text-xs text-zinc-400">{field.hint}</p>}
            </div>
          ))}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {profileSaving ? "Saving…" : "Save profile"}
            </button>
            {profileSaved && <span className="ml-3 text-sm text-green-600">Saved</span>}
          </div>
        </form>
      </section>
    </div>
  );
}

/** Comma-separated string <-> removable chips, with autocomplete suggestions. */
function TagInput({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState("");
  const tags = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setText("");
      return;
    }
    onChange([...tags, t].join(", "));
    setText("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((x) => x !== tag).join(", "));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(text);
    } else if (e.key === "Backspace" && !text && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const matches = text.trim()
    ? suggestions
        .filter(
          (s) =>
            s.toLowerCase().includes(text.toLowerCase()) &&
            !tags.some((t) => t.toLowerCase() === s.toLowerCase())
        )
        .slice(0, 6)
    : [];

  return (
    <div className="rounded border border-zinc-300 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tags.length ? "" : "e.g. Stripe, Airbnb…"}
          className="min-w-[8rem] flex-1 border-none text-sm outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => addTag(m)}
              className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              + {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
