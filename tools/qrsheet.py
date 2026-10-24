"""Build a printable A4 QR sheet (HTML, 6 cards per page, Hindi + English) for a site's spots.

Usage:
  python3 tools/qrsheet.py <site-id> <base-url> out.html [spot-id ...]

  site-id   folder under public/sites/ (gsp, cb, hospital)
  base-url  where the app is hosted, e.g. https://raasta.example.in/  (each QR opens <base-url>#<spot-id>)
  spot-id   optional; default = every gate, lift and stairs spot plus the site's popular places

Needs `pip install segno`. Print with the browser (Cmd+P → Save as PDF) or `node tools/topdf.js out.html out.pdf`.
"""
import base64, json, sys, html, pathlib
import segno

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / 'fonts' / 'package' / 'files'

def font_face(weight):
    # Embedded fonts when present (offline printing); otherwise fall back to Google Fonts below.
    if not FONTS.exists():
        return ''
    out = []
    for script in ('latin', 'devanagari'):
        f = FONTS / f'hind-{script}-{weight}-normal.woff2'
        b64 = base64.b64encode(f.read_bytes()).decode()
        rng = 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF' if script == 'devanagari' else 'U+0000-00FF,U+2013-2026,U+2190-21FF'
        out.append(f"@font-face{{font-family:Hind;font-weight:{weight};src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{rng}}}")
    return '\n'.join(out)

def qr_svg(url):
    q = segno.make(url, error='m')
    return q.svg_inline(scale=1, border=2, dark='#0E2645', omitsize=True)

def spots_of(site, ids):
    """Card data for each spot id, taken straight from site.json (buildings are data, not code)."""
    floors = {f['id']: f for f in site['floors']}
    first = site['floors'][0]['id']
    places = {p['id']: p for p in site['places']}
    cores = {c['id']: c for c in site['cores']}
    if not ids:
        ids = [p['id'] for p in site['places'] if p.get('gate')] + list(cores) + \
              [i for i in site.get('popular', []) if i in places and not places[i].get('gate')]
    out = []
    for i in ids:
        if i in cores:
            c = cores[i]
            lift = c['kind'] == 'lift'
            en, hi, fl = c.get('en') or ('Lift lobby' if lift else 'Stairs'), c.get('hi') or ('लिफ्ट लॉबी' if lift else 'सीढ़ियाँ'), c['floor']
        elif i in places:
            p = places[i]
            en, hi, fl = p['en'], p['hi'], p.get('floor', first)
        else:
            sys.exit(f'unknown spot id: {i}')
        f = floors[fl]
        out.append({'id': i, 'en': en, 'hi': hi, 'floor': f.get('btn', fl), 'floorEn': f['en'], 'floorHi': f['hi']})
    return out

def main(site_id, base, dst, ids):
    site = json.loads((ROOT / 'public' / 'sites' / site_id / 'site.json').read_text(encoding='utf-8'))
    d = {'base': base, 'site': site['name'], 'spots': spots_of(site, ids)}
    e = html.escape
    cards = []
    for s in d['spots']:
        url = f"{d['base']}#{s['id']}"
        cards.append(f"""<div class="card">
  <div class="top"><span class="brand">Raasta</span><span class="site">{e(d['site']['en'])}</span></div>
  <div class="floor"><b>{e(s['floor'])}</b><span>{e(s['floorEn'])} · {e(s['floorHi'])}</span></div>
  <div class="qr">{qr_svg(url)}</div>
  <div class="name">{e(s['en'])}</div>
  <div class="namehi">{e(s['hi'])}</div>
  <div class="cta">Scan to find your way · रास्ता देखने के लिए स्कैन करें</div>
  <div class="code">#{e(s['id'])}</div>
</div>""")
    fonts_link = '' if FONTS.exists() else '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind:wght@600;700&display=swap">'
    page = f"""<!doctype html><html><head><meta charset="utf-8">{fonts_link}<style>
{font_face(600)}
{font_face(700)}
@page{{size:A4;margin:8mm}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:Hind,sans-serif;color:#0F1B2D}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:0}}
.card{{height:93mm;border:1px dashed #9AA8BC;padding:5mm 6mm;display:flex;flex-direction:column;align-items:center;break-inside:avoid;text-align:center}}
.top{{width:100%;display:flex;justify-content:space-between;font-size:10pt;font-weight:600;color:#46566C}}
.brand{{color:#1557E6;font-weight:700}}
.floor{{display:flex;align-items:center;gap:3mm;margin-top:1.5mm}}
.floor b{{font-size:20pt;line-height:1;background:#0E2645;color:#fff;border-radius:2mm;padding:1.2mm 2.5mm 0.6mm}}
.floor span{{font-size:11pt;font-weight:600}}
.qr{{width:44mm;height:44mm;margin:3mm 0 2mm}}
.qr svg{{width:100%;height:100%}}
.name{{font-size:15pt;font-weight:700;line-height:1.1}}
.namehi{{font-size:13pt;font-weight:600;line-height:1.3}}
.cta{{font-size:8.5pt;color:#46566C;margin-top:1mm}}
.code{{font-family:monospace;font-size:8pt;color:#46566C;margin-top:auto}}
</style></head><body><div class="grid">{''.join(cards)}</div></body></html>"""
    pathlib.Path(dst).write_text(page, encoding='utf-8')
    print('cards:', len(cards))

if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:])
