const fs = require("fs");
const path = require("path");
const MarkdownIt = require(path.resolve(
  __dirname,
  "../../evpitch-frontend/node_modules/markdown-it"
));

const sourcePath = path.join(__dirname, "EVPITCH-TECHNICAL-HANDOVER.md");
const outputPath = path.join(__dirname, "EVPITCH-TECHNICAL-HANDOVER.html");
const source = fs.readFileSync(sourcePath, "utf8");
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
const content = markdown.render(source);

const document = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EVPitch Technical Handover</title>
  <style>
    :root { --blue: #1769aa; --navy: #17324d; --ink: #263442; --muted: #64748b; --line: #dbe4ec; --soft: #f3f7fa; }
    * { box-sizing: border-box; }
    html { background: #eaf0f5; }
    body { width: 210mm; margin: 18px auto; padding: 19mm 18mm 20mm; background: white; color: var(--ink); font: 10.4pt/1.55 Arial, Helvetica, sans-serif; box-shadow: 0 5px 24px rgba(15, 40, 65, .14); }
    h1 { margin: 0 0 7mm; padding: 27mm 13mm 23mm; color: white; background: linear-gradient(135deg, var(--navy), var(--blue)); border-radius: 4mm; font-size: 30pt; line-height: 1.12; letter-spacing: -.4px; }
    h1 + p { margin: -1mm 0 9mm; padding: 5mm 7mm; background: var(--soft); border-left: 1.2mm solid var(--blue); }
    h2 { margin: 9mm 0 3mm; padding-bottom: 1.5mm; color: var(--navy); border-bottom: .5mm solid var(--blue); font-size: 17pt; line-height: 1.2; break-after: avoid; }
    h3 { margin: 6mm 0 2mm; color: var(--blue); font-size: 12.5pt; break-after: avoid; }
    p { margin: 0 0 3.2mm; }
    ul, ol { margin: 1.5mm 0 4mm 6mm; padding-left: 4.5mm; }
    li { margin: 0 0 1.1mm; }
    table { width: 100%; margin: 3mm 0 5mm; border-collapse: collapse; font-size: 9.2pt; break-inside: avoid; }
    th { color: white; background: var(--navy); text-align: left; }
    th, td { padding: 2.3mm 2.5mm; border: .25mm solid var(--line); vertical-align: top; }
    tbody tr:nth-child(even) { background: var(--soft); }
    code { padding: .3mm 1mm; border-radius: 1mm; background: #eef3f7; color: #163b5c; font: 9pt Consolas, monospace; }
    pre { margin: 3mm 0 5mm; padding: 4mm; overflow-wrap: anywhere; white-space: pre-wrap; color: #e9f2f9; background: #142b40; border-radius: 2mm; break-inside: avoid; }
    pre code { padding: 0; color: inherit; background: transparent; }
    strong { color: var(--navy); }
    hr { margin: 10mm 0 5mm; border: 0; border-top: .4mm solid var(--line); }
    a { color: var(--blue); text-decoration: none; }
    @page { size: A4; margin: 14mm 13mm 16mm; }
    @media print {
      html { background: white; }
      body { width: auto; margin: 0; padding: 0; box-shadow: none; font-size: 9.6pt; }
      h1 { min-height: 90mm; padding-top: 30mm; break-after: avoid; }
      h2 { break-before: auto; }
      a { color: inherit; }
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;

fs.writeFileSync(outputPath, document, "utf8");
console.log(outputPath);

