const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const katex = require('katex')

const eqMath = katex.renderToString(
  'V(x) = \\frac{1}{2} x^T P x + \\int_0^t \\gamma \\|u(\\tau)\\|^2 d\\tau',
  { displayMode: true, throwOnError: false }
)

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&family=Space+Grotesk:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background: #f5f2e9;
      color: #1a1614;
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex;
      position: relative;
      padding: 56px 64px;
      -webkit-font-smoothing: antialiased;
    }

    .glow-1 {
      position: absolute;
      top: -120px;
      right: -100px;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(210, 92, 58, 0.12) 0%, transparent 70%);
      pointer-events: none;
    }
    .glow-2 {
      position: absolute;
      bottom: -150px;
      left: 200px;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(212, 255, 43, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }

    .og-container {
      display: grid;
      grid-template-columns: 560px 1fr;
      gap: 48px;
      width: 100%;
      height: 100%;
      z-index: 1;
      align-items: center;
    }

    /* Left Info */
    .left-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
    }

    .brand-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }

    .brand-squircle {
      width: 44px;
      height: 44px;
      background: #d25c3a;
      color: #ffffff;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.05em;
      box-shadow: 0 4px 14px rgba(210, 92, 58, 0.35);
    }

    .brand-title {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: #1a1614;
    }

    .eyebrow {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #d25c3a;
      margin-bottom: 12px;
    }

    h1 {
      font-size: 46px;
      line-height: 1.08;
      letter-spacing: -0.035em;
      font-weight: 800;
      color: #1a1614;
      margin-bottom: 16px;
    }

    .lede {
      font-size: 18px;
      line-height: 1.5;
      color: #5c554e;
      margin-bottom: 28px;
      max-width: 500px;
    }

    .pill-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #e3ded2;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: #2e2824;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    }

    .pill span.dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #d25c3a;
    }

    /* Right Preview: macOS Window Mockup */
    .right-col {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }

    .window-card {
      width: 480px;
      height: 480px;
      background: #141517;
      border-radius: 14px;
      border: 1px solid rgba(0, 0, 0, 0.25);
      box-shadow: 
        0 4px 12px rgba(0, 0, 0, 0.1),
        0 24px 60px rgba(0, 0, 0, 0.22);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .win-head {
      height: 38px;
      background: #1e2024;
      border-bottom: 1px solid #2b2e34;
      display: flex;
      align-items: center;
      padding: 0 14px;
      gap: 12px;
    }

    .lights {
      display: flex;
      gap: 6px;
    }
    .lights span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .c1 { background: #ff5f56; }
    .c2 { background: #ffbd2e; }
    .c3 { background: #27c93f; }

    .win-file {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #a1a1aa;
      background: #272a30;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .win-theme-pill {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 5px;
      background: #272a30;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      color: #d4d4d8;
    }
    .win-theme-pill .swatch {
      width: 9px;
      height: 9px;
      background: #d4ff2b;
      border-radius: 2px;
    }

    .win-body {
      flex: 1;
      background: #090a0c;
      padding: 20px 24px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    .a4-sheet {
      width: 100%;
      height: 100%;
      background: #ffffff;
      border-radius: 3px;
      padding: 20px 22px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .hdr {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e4e4e7;
      padding-bottom: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      font-weight: 700;
      color: #71717a;
      letter-spacing: 0.08em;
    }

    .doc-title {
      font-size: 15px;
      font-weight: 800;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      margin: 10px 0 6px;
    }

    .doc-p {
      font-size: 9.5px;
      line-height: 1.45;
      color: #27272a;
      margin-bottom: 8px;
    }

    .math-card {
      background: #fafafa;
      border: 1px solid #f0f0f0;
      border-radius: 4px;
      padding: 8px 10px;
      text-align: center;
      margin: 8px 0;
      position: relative;
    }

    .math-card .math-content {
      font-size: 11px;
    }

    .math-num {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      color: #71717a;
    }

    .callout {
      border-left: 3px solid #d4ff2b;
      background: #f5f8ea;
      padding: 6px 10px;
      border-radius: 0 4px 4px 0;
      font-size: 8.8px;
      line-height: 1.4;
      color: #111;
      margin-bottom: 8px;
    }

    .ftr {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #e4e4e7;
      padding-top: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      color: #71717a;
    }
  </style>
</head>
<body>
  <div class="glow-1"></div>
  <div class="glow-2"></div>

  <div class="og-container">
    <div class="left-col">
      <div class="brand-row">
        <div class="brand-squircle">F/</div>
        <div class="brand-title">folio.</div>
      </div>
      <div class="eyebrow">macOS Native Markdown Publisher</div>
      <h1>Plain Markdown.<br>Boardroom-ready pages.</h1>
      <p class="lede">
        Turn plain text Markdown into print-shop quality PDFs with real-time A4 pagination, cover sheets, LaTeX math, and zero cloud lock-in.
      </p>
      <div class="pill-list">
        <div class="pill"><span class="dot"></span>W3C Paged Media</div>
        <div class="pill"><span class="dot"></span>Native LaTeX Math</div>
        <div class="pill"><span class="dot"></span>7 Curated Themes</div>
        <div class="pill"><span class="dot"></span>100% Offline</div>
      </div>
    </div>

    <div class="right-col">
      <div class="window-card">
        <div class="win-head">
          <div class="lights">
            <span class="c1"></span>
            <span class="c2"></span>
            <span class="c3"></span>
          </div>
          <div class="win-file">📄 specification.md</div>
          <div class="win-theme-pill">
            <span class="swatch"></span>
            <span>Voltage</span>
          </div>
        </div>
        <div class="win-body">
          <div class="a4-sheet">
            <div>
              <div class="hdr">
                <span>FOLIO / APEX ROBOTICS</span>
                <span>SPEC-2026-09</span>
              </div>
              <div class="doc-title">2. State Estimation & Bounds</div>
              <div class="doc-p">Deterministic trajectory optimization over a 200 Hz boundary with proven Lyapunov stability:</div>
              <div class="math-card">
                <div class="math-content">${eqMath}</div>
                <span class="math-num">(2.1)</span>
              </div>
              <div class="callout">"Deterministic convergence guaranteed within 14 ms for perturbations."</div>
            </div>
            <div class="ftr">
              <span>Confidential · Apex Robotics Lab</span>
              <span>Page 2 of 4</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 630,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
    },
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Allow Google Fonts & KaTeX to finish rendering
    await new Promise((r) => setTimeout(r, 2000))

    const image = await win.webContents.capturePage({
      x: 0,
      y: 0,
      width: 1200,
      height: 630,
    })

    const png = image.toPNG()

    // Save to landing/public/og.png, landing/public/og-image.png, and public/og.png
    const targetPaths = [
      path.join(__dirname, '../landing/public/og.png'),
      path.join(__dirname, '../landing/public/og-image.png'),
      path.join(__dirname, '../public/og.png'),
      path.join(
        '/Users/carlos/.gemini/antigravity/brain/cbdd2b72-3f6a-44dd-95b9-b09836cbb748',
        'og-preview.png'
      ),
    ]

    for (const p of targetPaths) {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, png)
      console.log('Saved OG image to:', p)
    }
  } catch (err) {
    console.error('Failed to generate OG image:', err)
  } finally {
    app.quit()
  }
})
