#!/usr/bin/env python3
"""
Genera el PDF profesional Master-Guia-OpenClaw-Newsletter.pdf
a partir del markdown Newsletter-Config-PreMayo10.md

Uso:
    python3 make_pdf.py

Dependencias (instalar una vez):
    brew install pango gdk-pixbuf libffi
    pip3 install --user markdown weasyprint pygments

En macOS puede necesitar:
    DYLD_LIBRARY_PATH=/opt/homebrew/lib python3 make_pdf.py
"""
import os
from pathlib import Path
import markdown
from weasyprint import HTML, CSS

# Rutas relativas al directorio del script (portable)
BASE = Path(__file__).resolve().parent
MD_FILE = BASE / "master-guia.md"
PDF_FILE = BASE / "Master-Guia-OpenClaw-Newsletter.pdf"

# --- 1. Leer el markdown ---
with open(MD_FILE, "r", encoding="utf-8") as f:
    md_content = f.read()

# --- 2. Convertir Markdown → HTML con extensiones ---
md = markdown.Markdown(
    extensions=[
        "extra",          # tables, fenced code, etc.
        "codehilite",     # Pygments syntax highlighting
        "toc",            # auto table of contents
        "sane_lists",
        "smarty",
    ],
    extension_configs={
        "codehilite": {
            "css_class": "codehilite",
            "guess_lang": False,
            "use_pygments": True,
        },
        "toc": {
            "title": "Tabla de contenidos",
            "anchorlink": False,
            "permalink": False,
        },
    },
)
body_html = md.convert(md_content)
toc_html = md.toc

# --- 3. Cover page ---
cover_html = """
<section class="cover">
  <div class="cover-spacer"></div>
  <div class="cover-eyebrow">OpenClaw · Newsletter Editorial</div>
  <h1 class="cover-title">Master Guía</h1>
  <h2 class="cover-subtitle">Configuración completa end-to-end<br/>para producir un newsletter editorial<br/>desde cero</h2>
  <div class="cover-meta">
    <p>Basada en la implementación real de<br/><strong>AI for Executives</strong></p>
    <p class="cover-date">Marzo – Abril 2026</p>
  </div>
  <div class="cover-footer">
    <p>14 fases · ~8 horas de configuración · 1 cron diario · sistema autónomo</p>
  </div>
</section>
"""

# --- 4. TOC page ---
toc_section = f"""
<section class="toc-page">
  <h1 class="toc-title">Tabla de contenidos</h1>
  {toc_html}
</section>
"""

# --- 5. CSS ---
css = """
@page {
  size: A4;
  margin: 2.2cm 2cm 2.5cm 2cm;
  @bottom-center {
    content: counter(page);
    font-family: 'Helvetica Neue', sans-serif;
    font-size: 9pt;
    color: #888;
  }
  @top-right {
    content: "Master Guía — OpenClaw Newsletter";
    font-family: 'Helvetica Neue', sans-serif;
    font-size: 8pt;
    color: #aaa;
  }
}

@page :first {
  margin: 0;
  @bottom-center { content: ""; }
  @top-right { content: ""; }
}

@page cover {
  margin: 0;
  @bottom-center { content: ""; }
  @top-right { content: ""; }
}

/* --- COVER --- */
section.cover {
  page: cover;
  page-break-after: always;
  height: 29.7cm;
  width: 21cm;
  background: linear-gradient(160deg, #0b1d3a 0%, #1a3a6b 60%, #2c5fa8 100%);
  color: #fff;
  padding: 4cm 3cm;
  box-sizing: border-box;
  display: block;
  position: relative;
}
.cover-spacer { height: 4cm; }
.cover-eyebrow {
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 11pt;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #a8c4f0;
  margin-bottom: 1.5cm;
}
.cover-title {
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 64pt;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 1cm 0;
  line-height: 1;
  color: #ffffff;
}
.cover-subtitle {
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 18pt;
  font-weight: 300;
  margin: 0 0 3cm 0;
  line-height: 1.3;
  color: #d8e6f8;
}
.cover-meta {
  font-family: 'Georgia', serif;
  font-size: 13pt;
  line-height: 1.6;
  color: #cfdcf0;
}
.cover-meta strong {
  color: #ffffff;
  font-weight: 600;
}
.cover-date {
  margin-top: 0.5cm;
  font-style: italic;
  font-size: 11pt;
  color: #a8c4f0;
}
.cover-footer {
  position: absolute;
  bottom: 3cm;
  left: 3cm;
  right: 3cm;
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 10pt;
  color: #a8c4f0;
  border-top: 1px solid rgba(255,255,255,0.2);
  padding-top: 1cm;
}

/* --- TOC --- */
section.toc-page {
  page-break-after: always;
}
.toc-title {
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 32pt;
  font-weight: 700;
  color: #0b1d3a;
  border-bottom: 3px solid #0b1d3a;
  padding-bottom: 0.4cm;
  margin-bottom: 1.5cm;
}
.toc {
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 10pt;
  line-height: 1.7;
}
.toc ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}
.toc > ul > li {
  margin-bottom: 0.4cm;
}
.toc > ul > li > a {
  font-weight: 700;
  color: #0b1d3a;
  font-size: 11pt;
}
.toc ul ul {
  padding-left: 1cm;
  margin-top: 0.2cm;
}
.toc ul ul a {
  color: #444;
  font-weight: 400;
  font-size: 9.5pt;
}
.toc ul ul ul {
  padding-left: 0.8cm;
  font-size: 9pt;
}
.toc ul ul ul a {
  color: #777;
}
.toc a {
  text-decoration: none;
}

/* --- BODY --- */
body {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #222;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Helvetica Neue', 'Arial', sans-serif;
  color: #0b1d3a;
  page-break-after: avoid;
  page-break-inside: avoid;
}

h1 {
  font-size: 24pt;
  font-weight: 700;
  margin-top: 1.5cm;
  margin-bottom: 0.6cm;
  padding-bottom: 0.3cm;
  border-bottom: 2px solid #0b1d3a;
  page-break-before: always;
  letter-spacing: -0.01em;
}
h1:first-of-type {
  page-break-before: avoid;
}

h2 {
  font-size: 17pt;
  font-weight: 700;
  margin-top: 1cm;
  margin-bottom: 0.4cm;
  color: #1a3a6b;
}

h3 {
  font-size: 13pt;
  font-weight: 600;
  margin-top: 0.7cm;
  margin-bottom: 0.3cm;
  color: #2c5fa8;
}

h4 {
  font-size: 11pt;
  font-weight: 700;
  margin-top: 0.5cm;
  margin-bottom: 0.2cm;
  color: #333;
}

p {
  margin: 0.3cm 0;
  text-align: left;
}

a {
  color: #2c5fa8;
  text-decoration: none;
}

ul, ol {
  margin: 0.3cm 0;
  padding-left: 0.8cm;
}

li {
  margin: 0.1cm 0;
}

strong {
  font-weight: 700;
  color: #0b1d3a;
}

em {
  font-style: italic;
}

/* --- BLOCKQUOTE --- */
blockquote {
  margin: 0.5cm 0;
  padding: 0.4cm 0.7cm;
  background: #f4f7fc;
  border-left: 4px solid #2c5fa8;
  font-style: italic;
  color: #333;
  page-break-inside: avoid;
}
blockquote p {
  margin: 0.2cm 0;
}
blockquote strong, blockquote em {
  font-style: normal;
}

/* --- TABLE --- */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5cm 0;
  font-family: 'Helvetica Neue', sans-serif;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th {
  background: #0b1d3a;
  color: #fff;
  font-weight: 600;
  padding: 0.25cm 0.35cm;
  text-align: left;
  border: 1px solid #0b1d3a;
}
td {
  padding: 0.25cm 0.35cm;
  border: 1px solid #d8dde6;
  vertical-align: top;
}
tr:nth-child(even) td {
  background: #f7f9fc;
}

/* --- CODE --- */
code {
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 9pt;
  background: #f0f2f5;
  padding: 1px 5px;
  border-radius: 3px;
  color: #c0392b;
}

pre {
  background: #f4f6f9;
  border: 1px solid #dde2eb;
  border-radius: 5px;
  padding: 0.5cm 0.6cm;
  margin: 0.4cm 0;
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 8.5pt;
  line-height: 1.45;
  overflow-wrap: break-word;
  word-wrap: break-word;
  white-space: pre-wrap;
  page-break-inside: avoid;
}

pre code {
  background: transparent;
  padding: 0;
  color: #1a1a1a;
  font-size: 8.5pt;
  border-radius: 0;
}

/* Pygments syntax */
.codehilite { background: #f4f6f9; border-radius: 5px; }
.codehilite pre { margin: 0; }
.codehilite .k, .codehilite .kn, .codehilite .kd { color: #5e3c95; font-weight: 600; }
.codehilite .s, .codehilite .s1, .codehilite .s2 { color: #287a3e; }
.codehilite .c, .codehilite .c1 { color: #888; font-style: italic; }
.codehilite .nt { color: #2c5fa8; }
.codehilite .nf { color: #2c5fa8; }

/* --- HR --- */
hr {
  border: none;
  border-top: 1px solid #d8dde6;
  margin: 1cm 0;
}

/* --- Section breaks for major fases --- */
h2 + p:has(em:first-child) {
  color: #555;
  font-size: 10pt;
}
"""

# --- 6. Construir el HTML completo ---
full_html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Master Guía — OpenClaw Newsletter</title>
</head>
<body>
{cover_html}
{toc_section}
<main>
{body_html}
</main>
</body>
</html>
"""

# --- 7. Renderizar PDF ---
print("Renderizando PDF…")
HTML(string=full_html, base_url=str(BASE)).write_pdf(
    str(PDF_FILE),
    stylesheets=[CSS(string=css)],
)

size_kb = os.path.getsize(PDF_FILE) // 1024
print(f"OK → {PDF_FILE}  ({size_kb} KB)")
