const { useState, useEffect, useCallback, useRef } = React;
const html = htm.bind(React.createElement);

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#a855f7", "#eab308", "#3b82f6",
];
const FREE_COLOR = "#1e293b";
const FREE_KEY = -1;

function formatSize(bytes) {
  if (bytes >= 1024 ** 4) return (bytes / 1024 ** 4).toFixed(2) + " TB";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function parseHash() {
  // First segment is the numeric root id (stable, collision-free — names may repeat).
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return { rootId: null, namePath: [] };
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  const rootId = parts[0] ? parseInt(parts[0], 10) : NaN;
  return { rootId: Number.isNaN(rootId) ? null : rootId, namePath: parts.slice(1) };
}

function buildHash(rootId, namePath) {
  const segs = [rootId, ...namePath].filter(v => v != null)
    .map(v => encodeURIComponent(String(v)));
  return "#/" + segs.join("/");
}

function resolveNode(tree, namePath) {
  let node = tree;
  const resolvedPath = [];
  for (const name of namePath) {
    const child = (node.children || []).find(c => c.name === name && c.children);
    if (!child) break;
    node = child;
    resolvedPath.push(name);
  }
  return { node, resolvedPath };
}

function App() {
  const [roots, setRoots] = useState(null);
  const [rootId, setRootId] = useState(null);
  const [tree, setTree] = useState(null);
  const [namePath, setNamePath] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [error, setError] = useState(null);

  // Load roots list once.
  useEffect(() => {
    fetch("/api/roots").then(r => r.json()).then(rs => {
      setRoots(rs);
      const wanted = parseHash().rootId;
      const match = rs.find(r => r.id === wanted) || rs[0];
      if (match) setRootId(match.id);
    }).catch(e => setError("Could not load roots: " + e.message));
  }, []);

  const currentRoot = roots && roots.find(r => r.id === rootId);

  // Load current root's data whenever rootId changes.
  const loadData = useCallback(() => {
    if (rootId == null) return;
    fetch(`data-${rootId}.json?t=` + Date.now())
      .then(r => { if (!r.ok) throw new Error("no data yet"); return r.json(); })
      .then(setTree)
      .catch(() => setTree(null));
  }, [rootId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sync namePath from hash on load + back/forward.
  useEffect(() => {
    const apply = () => setNamePath(parseHash().namePath);
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // Poll status for the current root; reload data when a scan completes.
  const wasScanning = useRef(false);
  useEffect(() => {
    if (rootId == null) return;
    const tick = () => fetch(`/api/status?root=${rootId}`).then(r => r.json())
      .then(s => {
        setScanning(s.scanning);
        setLastScan(s.last_scan);
        if (wasScanning.current && !s.scanning) loadData(); // stays on namePath
        wasScanning.current = s.scanning;
      }).catch(() => {});
    tick();
    const iv = setInterval(tick, 3000);
    return () => clearInterval(iv);
  }, [rootId, loadData]);

  const triggerRescan = () => {
    setScanning(true);
    wasScanning.current = true;
    fetch("/api/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: rootId }),
    }).catch(() => setScanning(false));
  };

  if (error) return html`<div className="error"><span>⚠️</span><span>${error}</span></div>`;
  if (!roots || rootId == null) return html`<div className="loading"><div className="spinner"/><span>Loading…</span></div>`;

  const resolved = tree ? resolveNode(tree, namePath) : null;
  const currentNode = resolved ? resolved.node : null;

  // Navigation helpers (used by later tasks). Hash is keyed by numeric root id.
  const navigateTo = (newPath) => {
    location.hash = buildHash(rootId, newPath);
  };
  const switchRoot = (id) => {
    setRootId(id);
    setNamePath([]);
    location.hash = buildHash(id, []);
  };

  return html`
    <div className="container">
      <div className="header">
        <div>
          <h1>Disk Usage</h1>
          <p className="subtitle">${currentNode ? formatSize((currentNode.children||[]).reduce((s,c)=>s+c.size,0)) + " used" : "No scan yet"}</p>
        </div>
        <div style=${{display:"flex", gap:"8px", alignItems:"center"}}>
          <${RootSwitcher} roots=${roots} rootId=${rootId} onSwitch=${switchRoot}/>
          <button className=${"rescan-btn " + (scanning ? "scanning" : "")}
            onClick=${triggerRescan} disabled=${scanning}>
            <span className="icon">↻</span>${scanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>
      ${!tree && html`<p className="scan-time">No data for this disk yet — a scan is running.</p>`}
      ${currentNode && html`<${Body}
        root=${currentRoot} tree=${tree} currentNode=${currentNode}
        namePath=${resolved.resolvedPath}
        hovered=${hovered} setHovered=${setHovered}
        navigateTo=${navigateTo}
        lastScan=${lastScan}
        freeSpace=${resolved.resolvedPath.length === 0 ? tree.freeSpace : null} />`}
    </div>`;
}

function RootSwitcher({ roots, rootId, onSwitch }) {
  if (roots.length < 2) return null;
  return html`<select className="root-switcher" value=${rootId}
    onChange=${e => onSwitch(Number(e.target.value))}>
    ${roots.map(r => html`<option key=${r.id} value=${r.id}>${r.name}</option>`)}
  </select>`;
}

function Breadcrumbs({ rootName, namePath, onNavigate }) {
  const crumbs = [rootName, ...namePath];
  return html`<div className="breadcrumbs">
    ${crumbs.map((name, i) => html`<span key=${i} style=${{display:"flex",alignItems:"center",gap:"6px"}}>
      ${i > 0 && html`<span className="breadcrumb-sep">/</span>`}
      ${i < crumbs.length - 1
        ? html`<span className="breadcrumb" onClick=${() => onNavigate(namePath.slice(0, i))}>${name}</span>`
        : html`<span className="breadcrumb-current">${name}</span>`}
    </span>`)}
  </div>`;
}

function FileList({ items, hovered, setHovered, onItemClick }) {
  const maxSize = Math.max(1, ...items.map(i => i.size));
  return html`<div>
    ${items.map((item, i) => {
      const isDir = !!item.children;
      const active = hovered === i;
      return html`<div key=${item.name}
        className=${"file-row " + (isDir ? "clickable " : "") + (active ? "active" : "")}
        onMouseEnter=${() => setHovered(i)} onMouseLeave=${() => setHovered(null)}
        onClick=${() => isDir && onItemClick(item)}>
        <div className="file-name">
          <span className="file-icon">${isDir ? "📁" : "📄"}</span>
          <span className="file-label">${item.name}</span>
        </div>
        <div className="file-bar-container">
          <div className="file-bar" style=${{width: (item.size / maxSize) * 100 + "%", background: COLORS[i % COLORS.length]}}/>
        </div>
        <span className="file-size">${formatSize(item.size)}</span>
      </div>`;
    })}
  </div>`;
}

function Body({ root, currentNode, namePath, hovered, setHovered, navigateTo,
                lastScan, freeSpace }) {
  const sorted = [...(currentNode.children || [])].sort((a, b) => b.size - a.size);
  const enterDir = (item) => navigateTo([...namePath, item.name]);
  return html`
    <${Breadcrumbs} rootName=${root.name} namePath=${namePath}
      onNavigate=${(p) => navigateTo(p)}/>
    <${PieChart} items=${sorted} freeSpace=${freeSpace}
      hovered=${hovered} setHovered=${setHovered} onSliceClick=${enterDir}/>
    ${lastScan && html`<p className="scan-time">Last scan: ${timeAgo(lastScan)}</p>`}
    ${namePath.length > 0 && html`<div className="back-row"
      onClick=${() => navigateTo(namePath.slice(0, -1))}><span>←</span><span>..</span></div>`}
    <${FileList} items=${sorted} hovered=${hovered} setHovered=${setHovered}
      onItemClick=${enterDir}/>`;
}

function PieChart({ items, freeSpace, hovered, setHovered, onSliceClick }) {
  const size = 280, cx = 140, cy = 140, outerR = 130, innerR = 75;
  const total = items.reduce((s, it) => s + it.size, 0) + (freeSpace || 0) || 1;

  // Build target slices (keyed by list index; free slice = FREE_KEY).
  const targets = [];
  let acc = -Math.PI / 2;
  items.forEach((it, i) => {
    const sweep = (it.size / total) * Math.PI * 2;
    targets.push({ key: i, start: acc, sweep, color: COLORS[i % COLORS.length],
      item: it, size: it.size });
    acc += sweep;
  });
  if (freeSpace > 0) {
    const sweep = (freeSpace / total) * Math.PI * 2;
    targets.push({ key: FREE_KEY, start: acc, sweep, color: FREE_COLOR,
      item: { name: "Free space", size: freeSpace }, size: freeSpace });
  }

  const [frame, setFrame] = useState(targets);
  const frameRef = useRef(targets);  // latest ON-SCREEN frame — animate FROM this
  const rafRef = useRef(0);

  // Fingerprint the slice set + sizes. The effect re-runs ONLY when this changes,
  // so hover re-renders (which produce a new `items` array ref but identical sizes)
  // never restart the tween. Interrupts continue from the on-screen frame, not the
  // unreached target, so mid-flight drills/rescans blend instead of snapping.
  const sig = targets.map(s => `${s.key}:${s.size.toFixed(0)}`).join("|");

  useEffect(() => {
    const from = frameRef.current;
    const to = targets;
    if (!from || from.length === 0) { frameRef.current = to; setFrame(to); return; }
    const fromByKey = Object.fromEntries(from.map(s => [s.key, s]));
    const toByKey = Object.fromEntries(to.map(s => [s.key, s]));
    const keys = [...new Set([...from.map(s => s.key), ...to.map(s => s.key)])];
    const start = performance.now();
    const dur = 400;
    const ease = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = ease(t);
      const interp = keys.map(k => {
        const a = fromByKey[k], b = toByKey[k];
        const s0 = a || { start: b.start, sweep: 0, color: b.color, item: b.item, size: 0 };
        const s1 = b || { start: a.start, sweep: 0, color: a.color, item: a.item, size: 0 };
        return {
          key: k, color: s1.color || s0.color, item: s1.item || s0.item,
          start: s0.start + (s1.start - s0.start) * e,
          sweep: s0.sweep + (s1.sweep - s0.sweep) * e,
          size: (s1.size ?? 0),
        };
      }).filter(s => s.sweep > 0.0001);
      frameRef.current = interp;  // capture on-screen state for a clean interrupt
      setFrame(interp);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line
  }, [sig]);

  const arc = (s) => {
    const r = hovered === s.key ? outerR + 6 : outerR;
    const a0 = s.start, a1 = s.start + s.sweep;
    const x1 = cx + Math.cos(a0)*r, y1 = cy + Math.sin(a0)*r;
    const x2 = cx + Math.cos(a1)*r, y2 = cy + Math.sin(a1)*r;
    const ix1 = cx + Math.cos(a0)*innerR, iy1 = cy + Math.sin(a0)*innerR;
    const ix2 = cx + Math.cos(a1)*innerR, iy2 = cy + Math.sin(a1)*innerR;
    const la = s.sweep > Math.PI ? 1 : 0;
    return `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${la} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${la} 0 ${ix1} ${iy1}`;
  };

  const hi = hovered != null
    ? (frame.find(s => s.key === hovered) || {}).item
    : null;
  const usedTotal = total - (freeSpace || 0);

  return html`<div className="chart-container">
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
      ${frame.map(s => html`<path key=${s.key} d=${arc(s)} fill=${s.color}
        stroke="#0f172a" strokeWidth="2"
        style=${{cursor: (s.item && s.item.children) ? "pointer" : "default",
          opacity: hovered !== null && hovered !== s.key ? 0.45 : 1,
          transition: "opacity 0.2s"}}
        onMouseEnter=${() => setHovered(s.key)}
        onMouseLeave=${() => setHovered(null)}
        onClick=${() => s.item && s.item.children && onSliceClick(s.item)}/>`)}
      <text x=${cx} y=${cy-8} textAnchor="middle" fill="#e2e8f0"
        style=${{fontSize:"13px", fontFamily:"'DM Sans',sans-serif"}}>
        ${hi ? hi.name : "Total used"}</text>
      <text x=${cx} y=${cy+14} textAnchor="middle" fill="#f8fafc"
        style=${{fontSize:"18px", fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>
        ${hi ? formatSize(hi.size) : formatSize(usedTotal)}</text>
    </svg>
  </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App}/>`);
