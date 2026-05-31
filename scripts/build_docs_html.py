#!/usr/bin/env python3
"""Build single self-contained HTML from EduTutor markdown docs."""

import re, os, sys
from pathlib import Path

try:
    import markdown
except ImportError:
    sys.exit("pip install markdown")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "TECHNICKA_DOKUMENTACIA.html"

DOCS = [
    ("Technick\u00e1 dokument\u00e1cia", ROOT / "docs" / "TECHNICKA_DOKUMENTACIA.md"),
    ("Lipsync \u2014 kompar\u00e1cia", ROOT / "docs" / "research" / "lipsync_comparison.md"),
    ("V\u00fdkonnostn\u00e9 benchmarky", ROOT / "docs" / "benchmark_report.md"),
    ("Spr\u00e1vodca nasaden\u00edm", ROOT / "docs" / "deployment_guide.md"),
]

CSS = """
:root{--bg:#fff;--sidebar:#111827;--sidebar-text:#d1d5db;--sidebar-active:#60a5fa;
--accent:#2563eb;--text:#1f2937;--muted:#6b7280;--border:#e5e7eb;--code-bg:#f3f4f6;
--table-stripe:#f9fafb;--font:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
--mono:'SF Mono','JetBrains Mono','Fira Code',ui-monospace,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);font-size:16px;line-height:1.7;color:var(--text);background:var(--bg)}
/* sidebar */
.sidebar{position:fixed;top:0;left:0;width:280px;height:100vh;background:var(--sidebar);
color:var(--sidebar-text);overflow-y:auto;padding:24px 0;z-index:100;transition:transform .3s}
.sidebar .logo{padding:0 20px 20px;font-size:18px;font-weight:700;color:#fff;
border-bottom:1px solid #374151;margin-bottom:12px}
.sidebar .logo small{display:block;font-size:11px;color:#9ca3af;font-weight:400;margin-top:4px}
.sidebar nav a{display:block;padding:6px 20px;font-size:13px;color:var(--sidebar-text);
text-decoration:none;transition:background .15s}
.sidebar nav a:hover{background:#1f2937}
.sidebar nav a.doc-title{font-weight:600;color:#fff;font-size:14px;margin-top:16px;padding-top:10px;
border-top:1px solid #374151}
.sidebar nav a.h3{padding-left:36px;font-size:12px;color:#9ca3af}
/* main */
.main{margin-left:280px;max-width:900px;padding:40px 48px 80px}
.main h1{font-size:28px;font-weight:700;margin:48px 0 16px;color:var(--text);
border-bottom:2px solid var(--accent);padding-bottom:8px}
.main h2{font-size:22px;font-weight:700;margin:40px 0 12px;color:var(--text)}
.main h3{font-size:17px;font-weight:600;margin:28px 0 8px;color:var(--text)}
.main h4{font-size:15px;font-weight:600;margin:20px 0 6px}
.main p{margin:8px 0}
.main hr{border:none;border-top:1px solid var(--border);margin:32px 0}
.main a{color:var(--accent);text-decoration:none}
.main a:hover{text-decoration:underline}
.main ul,.main ol{margin:8px 0 8px 24px}
.main li{margin:4px 0}
.main blockquote{border-left:3px solid var(--accent);padding:8px 16px;margin:12px 0;
background:var(--code-bg);color:var(--muted);font-style:italic}
.main strong{font-weight:600}
/* tables */
.main table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
.main th{background:var(--sidebar);color:#fff;padding:10px 12px;text-align:left;font-weight:600}
.main td{padding:8px 12px;border-bottom:1px solid var(--border)}
.main tr:nth-child(even){background:var(--table-stripe)}
/* code */
.main code{font-family:var(--mono);font-size:13px;background:var(--code-bg);
padding:2px 6px;border-radius:4px}
.main pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;
padding:16px 20px;overflow-x:auto;margin:16px 0;line-height:1.5}
.main pre code{background:none;padding:0;font-size:13px}
/* doc separator */
.doc-separator{border:none;border-top:3px solid var(--accent);margin:64px 0 32px;position:relative}
/* hamburger */
.hamburger{display:none;position:fixed;top:12px;left:12px;z-index:200;background:var(--sidebar);
color:#fff;border:none;font-size:24px;padding:8px 12px;border-radius:6px;cursor:pointer}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:90}
/* footer */
.footer{text-align:center;color:var(--muted);font-size:12px;padding:32px 0;
border-top:1px solid var(--border);margin-top:48px}
/* print */
@media print{
.sidebar,.hamburger,.overlay{display:none!important}
.main{margin:0;max-width:100%;padding:20px}
.main pre{white-space:pre-wrap;word-break:break-all}
.doc-separator{page-break-before:always}
}
/* mobile */
@media(max-width:768px){
.sidebar{transform:translateX(-100%)}
.sidebar.open{transform:translateX(0)}
.overlay.open{display:block}
.hamburger{display:block}
.main{margin-left:0;padding:24px 16px 60px}
}
"""

JS = """
document.addEventListener('DOMContentLoaded',function(){
var btn=document.querySelector('.hamburger'),sb=document.querySelector('.sidebar'),
ov=document.querySelector('.overlay');
function toggle(){sb.classList.toggle('open');ov.classList.toggle('open')}
btn.addEventListener('click',toggle);
ov.addEventListener('click',toggle);
document.querySelectorAll('.sidebar nav a').forEach(function(a){
a.addEventListener('click',function(){if(window.innerWidth<=768)toggle()})});
});
"""


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s)
    return s[:60]


def build_nav_and_content(docs):
    nav_html = ""
    content_html = ""
    md_ext = markdown.Markdown(extensions=['tables', 'fenced_code'])

    for idx, (title, path) in enumerate(docs):
        if not path.exists():
            print(f"  SKIP: {path} not found")
            continue

        raw = path.read_text(encoding='utf-8')
        doc_id = f"doc-{idx}"

        # extract h2/h3 for nav
        nav_html += f'<a href="#{doc_id}" class="doc-title">{title}</a>\n'
        for m in re.finditer(r'^(#{2,3})\s+(.+)$', raw, re.MULTILINE):
            level = len(m.group(1))
            heading = m.group(2).strip()
            anchor = f"{doc_id}-{slugify(heading)}"
            cls = "h3" if level == 3 else ""
            nav_html += f'<a href="#{anchor}" class="{cls}">{heading}</a>\n'

        # convert md to html
        md_ext.reset()
        html_body = md_ext.convert(raw)

        # inject anchors into headings
        def add_anchor(match):
            tag = match.group(1)
            content = match.group(2)
            anchor = f"{doc_id}-{slugify(re.sub(r'<[^>]+>', '', content))}"
            return f'<h{tag} id="{anchor}">{content}</h{tag}>'

        html_body = re.sub(r'<h([23])>(.+?)</h\1>', add_anchor, html_body)

        separator = '<hr class="doc-separator">' if idx > 0 else ''
        content_html += f'{separator}\n<div id="{doc_id}">\n{html_body}\n</div>\n'

    return nav_html, content_html


def main():
    print("Building EduTutor HTML documentation...")
    nav, content = build_nav_and_content(DOCS)

    html = f"""<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EduTutor.AI \u2014 Technick\u00e1 dokument\u00e1cia</title>
<style>{CSS}</style>
</head>
<body>
<button class="hamburger" aria-label="Menu">\u2630</button>
<div class="overlay"></div>
<aside class="sidebar">
<div class="logo">
EduTutor.AI
<small>Grant 09I05-03-V04-00072<br>SORRYWECAN s.r.o. \u00b7 Apr\u00edl 2026</small>
</div>
<nav>{nav}</nav>
</aside>
<div class="main">
{content}
<div class="footer">
EduTutor.AI \u00b7 SORRYWECAN s.r.o. \u00b7 Grant 09I05-03-V04-00072 \u00b7 Apr\u00edl 2026
</div>
</div>
<script>{JS}</script>
</body>
</html>"""

    OUT.write_text(html, encoding='utf-8')
    print(f"\n  \u2713 {OUT}")
    print(f"  Size: {len(html):,} bytes")
    print(f"  Open: file://{OUT}")


if __name__ == "__main__":
    main()
