import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopType,
  BorderStyle,
} from "docx";
import PDFDocument from "pdfkit";
import { ResumeData, ResumeExperience, ResumeEducation } from "./resume";

// Visual design mirrors the user's own resume template:
//  - A4 page, tight (~14pt) margins
//  - A thin lavender rule above each section header
//  - Three-column entry rows: date (left) · title, company (center) · location (right)
//  - Bold inline emphasis on metrics, written as **like this** in the source text
//  - A single compact "Additional Skills" block for skills/certs/awards/languages
const ACCENT = "#cc99ff";

function dateRange(start?: string, end?: string): string {
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}

/** Split a string into runs, treating **text** as bold. */
function richSegments(s: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out.length ? out : [{ text: s, bold: false }];
}

function headerContact(resume: ResumeData): string {
  const c = resume.contact || { links: [] };
  return [c.email, c.phone, ...(c.links || [])].filter(Boolean).join("  |  ");
}

const A4: [number, number] = [595.28, 841.89];
const PDF_MARGINS = { top: 16, left: 14, right: 19, bottom: 24 };

/**
 * Draws the resume into `doc`, scaling every font size and vertical gap by
 * `scale`. Returns the y-coordinate where the Education section ends (or
 * Work Experience / the header if Education is absent) — i.e. the bottom of the
 * "must stay on page one" block, used by the fit pass.
 */
function drawResumePdf(doc: InstanceType<typeof PDFDocument>, resume: ResumeData, scale: number): number {
  const LEFT = doc.page.margins.left;
  const RIGHT = doc.page.width - doc.page.margins.right;
  const DATE_W = 104;
  const CONTENT_X = LEFT + DATE_W;
  const CONTENT_W = RIGHT - CONTENT_X;
  const BULLET_X = CONTENT_X + 12;
  const sz = {
    name: 13 * scale,
    contact: 9.5 * scale,
    section: 11.5 * scale,
    entry: 11 * scale,
    body: 9.5 * scale,
  };
  const GAP = 4 * scale; // heading -> first line, and entry title -> first bullet
  const ENTRY_GAP = 6 * scale; // between consecutive entries in a section
  const LINE = 14 * scale; // entry title row height

  const rich = (text: string, x: number, width: number, size: number, italic = false) => {
    const segs = richSegments(text);
    const y = doc.y;
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1;
      const font = seg.bold
        ? italic
          ? "Helvetica-BoldOblique"
          : "Helvetica-Bold"
        : italic
          ? "Helvetica-Oblique"
          : "Helvetica";
      doc.font(font).fontSize(size).fillColor("#000");
      if (i === 0) doc.text(seg.text, x, y, { width, continued: !last });
      else doc.text(seg.text, { width, continued: !last });
    });
  };

  const section = (title: string) => {
    doc.moveDown(0.6);
    const y = doc.y;
    doc.rect(LEFT, y, RIGHT - LEFT, 1.4).fill(ACCENT);
    doc.fillColor("#000");
    doc.y = y + 4 * scale;
    doc.font("Helvetica-Bold").fontSize(sz.section).fillColor("#000").text(title, LEFT, doc.y);
    doc.y += GAP;
  };

  // date (left) · title (center) · location (right), all on one baseline.
  const entryRow = (dateStr: string, title: string, location: string) => {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(sz.entry).fillColor("#000");
    let locW = 0;
    if (location) {
      locW = doc.widthOfString(location) + 8;
      doc.text(location, LEFT, y, { width: RIGHT - LEFT, align: "right", lineBreak: false });
    }
    if (dateStr) doc.text(dateStr, LEFT, y, { width: DATE_W, lineBreak: false });
    doc.text(title, CONTENT_X, y, { width: CONTENT_W - locW, lineBreak: false });
    doc.y = y + LINE;
    doc.x = LEFT;
  };

  const subLine = (text: string) => rich(text, CONTENT_X, CONTENT_W, sz.body, true);

  const bullet = (text: string) => {
    const y = doc.y;
    doc.font("Helvetica").fontSize(sz.body).fillColor("#000").text("•", CONTENT_X, y, {
      width: 10,
      lineBreak: false,
    });
    // The marker call advances doc.y a line; reset so text shares its baseline.
    doc.y = y;
    rich(text, BULLET_X, CONTENT_W - 12, sz.body);
  };

  // --- Header ---
  const c = resume.contact || { links: [] };
  if (c.name) {
    doc
      .font("Helvetica-Bold")
      .fontSize(sz.name)
      .fillColor("#000")
      .text(c.name.toUpperCase(), LEFT, doc.y, { align: "center", width: RIGHT - LEFT });
  }
  const contact = headerContact(resume);
  if (contact) {
    doc
      .font("Helvetica")
      .fontSize(sz.contact)
      .fillColor("#000")
      .text(contact, LEFT, doc.y, { align: "center", width: RIGHT - LEFT });
  }

  // Bottom of the block that must stay on page 1 (updated through Education).
  let mustFitBottom = doc.y;

  if (resume.summary) {
    section("Summary");
    rich(resume.summary, LEFT, RIGHT - LEFT, sz.body);
    mustFitBottom = doc.y;
  }

  // --- Work Experience (first) ---
  if (resume.experience?.length) {
    section("Work Experience");
    (resume.experience as ResumeExperience[]).forEach((exp, i) => {
      if (i > 0) doc.y += ENTRY_GAP;
      const title = [exp.title, exp.company].filter(Boolean).join(", ");
      entryRow(dateRange(exp.startDate, exp.endDate), title, exp.location || "");
      doc.y += GAP;
      for (const b of exp.bullets || []) bullet(b);
    });
    mustFitBottom = doc.y;
  }

  // --- Education ---
  if (resume.education?.length) {
    section("Education");
    (resume.education as ResumeEducation[]).forEach((ed, i) => {
      if (i > 0) doc.y += ENTRY_GAP;
      entryRow(dateRange(ed.startDate, ed.endDate), ed.school || "", "");
      const degParts = [ed.degree, ed.field].filter(Boolean).join(", ");
      const sub = [degParts, ed.gpa ? `Grade: **${ed.gpa}**` : ""].filter(Boolean).join(", ");
      if (sub) subLine(sub);
    });
    mustFitBottom = doc.y;
  }

  // --- Academic Projects --- (may flow onto page 2)
  if (resume.projects?.length) {
    section("Academic Projects");
    resume.projects.forEach((p, i) => {
      if (i > 0) doc.y += ENTRY_GAP;
      const title = [p.name, p.organization].filter(Boolean).join(", ");
      entryRow(p.date || "", title, "");
      doc.y += GAP;
      for (const b of p.bullets || []) bullet(b);
    });
  }

  // --- Extra-Curricular Activities ---
  if (resume.activities?.length) {
    section("Extra-Curricular Activities");
    resume.activities.forEach((a, i) => {
      if (i > 0) doc.y += ENTRY_GAP;
      const title = [a.title, a.organization].filter(Boolean).join(", ");
      entryRow(a.date || "", title, "");
      doc.y += GAP;
      for (const b of a.bullets || []) bullet(b);
    });
  }

  // --- Additional Skills (compact label : value lines) ---
  const skillLines: [string, string][] = [];
  if (resume.skills?.length) skillLines.push(["IT Skills", resume.skills.join(", ")]);
  if (resume.certifications?.length)
    skillLines.push(["Certifications", resume.certifications.join("; ")]);
  if (resume.awards?.length) skillLines.push(["Awards", resume.awards.join("; ")]);
  if (resume.languages?.length) skillLines.push(["Languages", resume.languages.join(", ")]);
  if (skillLines.length) {
    section("Additional Skills");
    skillLines.forEach(([label, value], i) => {
      if (i > 0) doc.y += 2 * scale;
      doc
        .font("Helvetica-Bold")
        .fontSize(sz.body)
        .fillColor("#000")
        .text(`${label}: `, LEFT, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(sz.body).text(value, { width: RIGHT - LEFT });
    });
  }

  return mustFitBottom;
}

// Approx body line height (pt) at full size, for estimating overflow in lines.
const LINE_PT = 12.4;

/**
 * Measure whether Work Experience + Education fit on page one at full size.
 * Renders onto an unbreakable (very tall) page to get the block's true height,
 * then compares against the page-1 content area. Used to warn the user (we no
 * longer silently shrink) so they can rework/trim bullets.
 */
export function measurePageFit(resume: ResumeData): {
  fitsOnePage: boolean;
  linesOver: number;
} {
  const measure = new PDFDocument({ size: [A4[0], 100000], margins: PDF_MARGINS });
  const bottom = drawResumePdf(measure, resume, 1);
  measure.end();
  const needed = bottom - PDF_MARGINS.top;
  const available = A4[1] - PDF_MARGINS.top - PDF_MARGINS.bottom;
  const overflow = needed - available;
  return {
    fitsOnePage: overflow <= 0,
    linesOver: overflow > 0 ? Math.ceil(overflow / LINE_PT) : 0,
  };
}

/**
 * Apply-ready copy: single-column PDF mirroring the user's template. Always
 * rendered at full size — if content overflows page 1 the UI warns (see
 * measurePageFit) rather than shrinking the text silently.
 */
export function resumeToPdf(resume: ResumeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: PDF_MARGINS });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawResumePdf(doc, resume, 1);
    doc.end();
  });
}

/** Editable copy: clean ATS-safe single-column Word document, same layout. */
export async function resumeToDocx(resume: ResumeData): Promise<Buffer> {
  // A4 in twips (1 in = 1440 twips); ~0.3in margins to match the tight PDF.
  const PAGE_W = 11906;
  const MARGIN = 430;
  const TEXT_W = PAGE_W - MARGIN * 2;
  // Date column width in twips; must exceed the widest date string (~1900) so the
  // title tabs to the content column instead of skipping to the right tab stop.
  const CONTENT_TAB = 2080;

  const children: Paragraph[] = [];
  const c = resume.contact || { links: [] };

  const runs = (text: string, opts: { size: number; italics?: boolean }) =>
    richSegments(text).map(
      (seg) =>
        new TextRun({
          text: seg.text,
          bold: seg.bold,
          italics: opts.italics,
          size: opts.size,
        })
    );

  if (c.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: c.name.toUpperCase(), bold: true, size: 26 })],
      })
    );
  }
  const contact = headerContact(resume);
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: contact, size: 19 })],
      })
    );
  }

  // after: 80 twips (4pt) = uniform gap between a heading and the first line under it.
  // `keep`: keepNext/keepLines so Word doesn't split the section across pages.
  const section = (title: string, keep = false) =>
    new Paragraph({
      spacing: { before: 160, after: 80 },
      keepNext: keep,
      keepLines: keep,
      border: {
        top: { style: BorderStyle.SINGLE, size: 12, color: "CC99FF", space: 3 },
      },
      children: [new TextRun({ text: title, bold: true, size: 23 })],
    });

  // date \t title \t location(right) — one baseline via tab stops.
  // `before`: 0 for the first entry (the heading's 4pt `after` supplies the gap),
  // ~120 (6pt) between consecutive entries.
  const entryRow = (dateStr: string, title: string, location: string, before = 120, keep = false) =>
    new Paragraph({
      spacing: { before },
      keepNext: keep,
      keepLines: keep,
      tabStops: [
        { type: TabStopType.LEFT, position: CONTENT_TAB },
        { type: TabStopType.RIGHT, position: TEXT_W },
      ],
      children: [
        new TextRun({ text: dateStr, bold: true, size: 22 }),
        new TextRun({ text: `\t${title}`, bold: true, size: 22 }),
        ...(location ? [new TextRun({ text: `\t${location}`, bold: true, size: 22 })] : []),
      ],
    });

  const subLine = (text: string, keep = false) =>
    new Paragraph({
      indent: { left: CONTENT_TAB },
      keepNext: keep,
      keepLines: keep,
      children: runs(text, { size: 19, italics: true }),
    });

  // `before`: 80 twips (4pt) on the first bullet (entry title -> first bullet), 0 after.
  const bullet = (text: string, before = 0) =>
    new Paragraph({
      spacing: before ? { before } : undefined,
      indent: { left: CONTENT_TAB, hanging: 190 },
      children: [new TextRun({ text: "•  ", size: 19 }), ...runs(text, { size: 19 })],
    });

  if (resume.summary) {
    children.push(section("Summary"));
    children.push(new Paragraph({ children: runs(resume.summary, { size: 19 }) }));
  }

  if (resume.experience?.length) {
    children.push(section("Work Experience"));
    (resume.experience as ResumeExperience[]).forEach((exp, i) => {
      const title = [exp.title, exp.company].filter(Boolean).join(", ");
      children.push(entryRow(dateRange(exp.startDate, exp.endDate), title, exp.location || "", i === 0 ? 0 : 120));
      (exp.bullets || []).forEach((b, j) => children.push(bullet(b, j === 0 ? 80 : 0)));
    });
  }

  if (resume.education?.length) {
    // keep=true so Word keeps the whole Education section together on one page.
    children.push(section("Education", true));
    (resume.education as ResumeEducation[]).forEach((ed, i) => {
      children.push(entryRow(dateRange(ed.startDate, ed.endDate), ed.school || "", "", i === 0 ? 0 : 120, true));
      const degParts = [ed.degree, ed.field].filter(Boolean).join(", ");
      const sub = [degParts, ed.gpa ? `Grade: **${ed.gpa}**` : ""].filter(Boolean).join(", ");
      if (sub) children.push(subLine(sub, true));
    });
  }

  if (resume.projects?.length) {
    children.push(section("Academic Projects"));
    resume.projects.forEach((p, i) => {
      const title = [p.name, p.organization].filter(Boolean).join(", ");
      children.push(entryRow(p.date || "", title, "", i === 0 ? 0 : 120));
      (p.bullets || []).forEach((b, j) => children.push(bullet(b, j === 0 ? 80 : 0)));
    });
  }

  if (resume.activities?.length) {
    children.push(section("Extra-Curricular Activities"));
    resume.activities.forEach((a, i) => {
      const title = [a.title, a.organization].filter(Boolean).join(", ");
      children.push(entryRow(a.date || "", title, "", i === 0 ? 0 : 120));
      (a.bullets || []).forEach((b, j) => children.push(bullet(b, j === 0 ? 80 : 0)));
    });
  }

  const skillLines: [string, string][] = [];
  if (resume.skills?.length) skillLines.push(["IT Skills", resume.skills.join(", ")]);
  if (resume.certifications?.length)
    skillLines.push(["Certifications", resume.certifications.join("; ")]);
  if (resume.awards?.length) skillLines.push(["Awards", resume.awards.join("; ")]);
  if (resume.languages?.length) skillLines.push(["Languages", resume.languages.join(", ")]);
  if (skillLines.length) {
    children.push(section("Additional Skills"));
    skillLines.forEach(([label, value], i) => {
      children.push(
        new Paragraph({
          spacing: { before: i === 0 ? 0 : 20 },
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 19 }),
            new TextRun({ text: value, size: 19 }),
          ],
        })
      );
    });
  }

  const doc = new Document({
    // Without an explicit font Word falls back to its default (often Times New
    // Roman); force Arial to match the apply-ready PDF.
    styles: { default: { document: { run: { font: "Arial", size: 19 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
