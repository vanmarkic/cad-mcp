#!/usr/bin/env python3
"""Render a markdown sidecar note -> A4 PDF (bilingual, full Unicode via embedded DejaVu).
Default: the plan-de-division methodological note.
Usage: ./.venv/bin/python navvis_export/scripts/render_note_pdf.py [in.md] [out.pdf]"""
import os, sys, re
import matplotlib, markdown, fitz

ROOT = "/Users/dragan/Documents/cad-mcp"
SRC = sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/reference/plandedivision_vs_navvis_README.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(SRC)[0] + ".pdf"
FONT_DIR = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")

md = open(SRC, encoding="utf-8").read()
body = markdown.markdown(md, extensions=["tables", "fenced_code", "sane_lists"])

CSS = """
@font-face { font-family: dv; src: url(DejaVuSans.ttf); font-weight: normal; }
@font-face { font-family: dv; src: url(DejaVuSans-Bold.ttf); font-weight: bold; }
@font-face { font-family: dvm; src: url(DejaVuSansMono.ttf); }
* { font-family: dv; }
body { font-size: 9.5pt; line-height: 1.45; color: #161616; }
h1 { font-size: 15pt; color: #1a3a5a; border-bottom: 2px solid #1a3a5a; padding-bottom: 3px; }
h2 { font-size: 12.5pt; color: #1a3a5a; margin-top: 14px; border-bottom: 1px solid #b8c6d6; }
h3 { font-size: 10.5pt; color: #333; margin-top: 10px; }
p, li { font-size: 9.5pt; }
table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 8.8pt; }
th, td { border: 0.6pt solid #888; padding: 3px 6px; text-align: left; }
th { background: #e8eef5; font-weight: bold; }
code, pre { font-family: dvm; font-size: 8.5pt; background: #f2f2f2; }
pre { padding: 6px; border: 0.5pt solid #ccc; }
hr { border: none; border-top: 0.6pt solid #bbb; margin: 10px 0; }
strong { font-weight: bold; }
"""

HTML = f"<html><head></head><body>{body}</body></html>"

arch = fitz.Archive(FONT_DIR)
story = fitz.Story(html=HTML, user_css=CSS, archive=arch)
writer = fitz.DocumentWriter(OUT)
MEDIA = fitz.paper_rect("a4")
WHERE = MEDIA + (48, 40, -48, -44)
more = 1
while more:
    dev = writer.begin_page(MEDIA)
    more, _ = story.place(WHERE)
    story.draw(dev)
    writer.end_page()
writer.close()
print("saved:", OUT, "(", fitz.open(OUT).page_count, "pages )")
