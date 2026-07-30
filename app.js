const { useState, useEffect, useCallback, useRef } = React;
const html = htm.bind(React.createElement);

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#a855f7", "#eab308", "#3b82f6",
];
const FREE_COLOR = "#1e293b";
const FREE_KEY = -1;
const BIG_SIZE = 280;
const THUMB_SIZE = 76;

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

function sortedChildren(node) {
  return [...((node && node.children) || [])].sort((a, b) => b.size - a.size);
}

function App() {
  const [roots, setRoots] = useState(null);
  const [rootId, setRootId] = useState(null);
  const [trees, setTrees] = useState({}); // { [rootId]: tree }
  const [namePath, setNamePath] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [error, setError] = useState(null);

  const treesRef = useRef({});
  useEffect(() => { treesRef.current = trees; }, [trees]);

  const currentRoot = roots && roots.find(r => r.id === rootId);
  const tree = rootId != null ? trees[rootId] : null;

  const loadRootData = useCallback((id) => {
    return fetch(`data-${id}.json?t=` + Date.now())
      .then(r => { if (!r.ok) throw new Error("no data yet"); return r.json(); })
      .then(t => setTrees(prev => ({ ...prev, [id]: t })))
      .catch(() => {});
  }, []);

  // Sync namePath from hash on load + back/forward.
  useEffect(() => {
    const apply = () => setNamePath(parseHash().namePath);
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // Poll /api/roots (covers every root's scanning/last_scan in one call). On
  // first success, pick the initial rootId from the hash. On every tick,
  // reload a root's tree if its scan just finished, or if we're still missing
  // data it already has (covers both "rescan completed" and "initial bulk load").
  const wasScanningRef = useRef({});
  const initializedRef = useRef(false);
  useEffect(() => {
    const tick = () => fetch("/api/roots").then(r => r.json()).then(rs => {
      setRoots(rs);
      if (!initializedRef.current) {
        initializedRef.current = true;
        const wanted = parseHash().rootId;
        const match = rs.find(r => r.id === wanted) || rs[0];
        if (match) setRootId(match.id);
      }
      rs.forEach(r => {
        const finished = wasScanningRef.current[r.id] && !r.scanning;
        const missing = !treesRef.current[r.id] && r.last_scan;
        if (finished || missing) loadRootData(r.id);
        wasScanningRef.current[r.id] = r.scanning;
      });
    }).catch(e => { if (!initializedRef.current) setError("Could not load roots: " + e.message); });
    tick();
    const iv = setInterval(tick, 3000);
    return () => clearInterval(iv);
  }, [loadRootData]);

  const [optimisticScanning, setOptimisticScanning] = useState({});
  const triggerRescan = () => {
    setOptimisticScanning(prev => ({ ...prev, [rootId]: true }));
    wasScanningRef.current[rootId] = true;
    fetch("/api/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: rootId }),
    }).catch(() => setOptimisticScanning(prev => ({ ...prev, [rootId]: false })));
  };

  if (error) return html`<div className="error"><span>⚠️</span><span>${error}</span></div>`;
  if (!roots || rootId == null) return html`<div className="loading"><div className="spinner"/><span>Loading…</span></div>`;

  const scanning = !!(optimisticScanning[rootId] || (currentRoot && currentRoot.scanning));
  const lastScan = currentRoot && currentRoot.last_scan;

  const resolved = tree ? resolveNode(tree, namePath) : null;
  const currentNode = resolved ? resolved.node : null;

  const navigateTo = (newPath) => {
    location.hash = buildHash(rootId, newPath);
  };
  const selectRoot = (id) => {
    if (id === rootId) return;
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
          <button className=${"rescan-btn " + (scanning ? "scanning" : "")}
            onClick=${triggerRescan} disabled=${scanning}>
            <span className="icon">↻</span>${scanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>
      ${!tree && html`<p className="scan-time">No data for this disk yet — a scan is running.</p>`}
      ${currentNode && html`<${Body}
        root=${currentRoot} roots=${roots} rootId=${rootId} trees=${trees}
        currentNode=${currentNode}
        namePath=${resolved.resolvedPath}
        hovered=${hovered} setHovered=${setHovered}
        navigateTo=${navigateTo}
        onSelectRoot=${selectRoot}
        lastScan=${lastScan}
        freeSpace=${resolved.resolvedPath.length === 0 ? tree.freeSpace : null} />`}
      <div style=${{marginTop:"48px",paddingTop:"16px",borderTop:"1px solid #1e293b",textAlign:"right"}}>
        <a href="https://github.com/Sloy/disk-usage" target="_blank" rel="noopener noreferrer"
          style=${{fontSize:"12px",color:"#475569",textDecoration:"none"}}>Made by Rafa with ♥︎</a>
      </div>
    </div>`;
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

function Body({ root, roots, rootId, trees, currentNode, namePath, hovered, setHovered,
                navigateTo, onSelectRoot, lastScan, freeSpace }) {
  const sorted = sortedChildren(currentNode);
  const enterDir = (item) => navigateTo([...namePath, item.name]);
  const multiRoot = roots.length >= 2;
  return html`
    <${Breadcrumbs} rootName=${root.name} namePath=${namePath}
      onNavigate=${(p) => navigateTo(p)}/>
    ${multiRoot
      ? html`<${Carousel} roots=${roots} rootId=${rootId} trees=${trees}
          selectedSorted=${sorted} selectedFreeSpace=${freeSpace}
          hovered=${hovered} setHovered=${setHovered}
          onSelect=${onSelectRoot} onSliceClick=${enterDir}/>`
      : html`<div className="chart-container">
          <${PieChart} items=${sorted} freeSpace=${freeSpace} size=${BIG_SIZE} interactive=${true}
            hovered=${hovered} setHovered=${setHovered} onSliceClick=${enterDir}/>
        </div>`}
    ${lastScan && html`<p className="scan-time">Last scan: ${timeAgo(lastScan)}</p>`}
    ${namePath.length > 0 && html`<div className="back-row"
      onClick=${() => navigateTo(namePath.slice(0, -1))}><span>←</span><span>..</span></div>`}
    <${FileList} items=${sorted} hovered=${hovered} setHovered=${setHovered}
      onItemClick=${enterDir}/>`;
}

function Carousel({ roots, rootId, trees, selectedSorted, selectedFreeSpace,
                     hovered, setHovered, onSelect, onSliceClick }) {
  const selectedIndex = roots.findIndex(r => r.id === rootId);
  const trackRef = useRef(null);
  const viewportRef = useRef(null);
  const mountedRef = useRef(false);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  // Computed from the known *final* slot sizes rather than measured from the
  // live DOM: right after a selection change, the selected/deselected slots
  // are still mid-resize (their width transition just started), so reading
  // offsetLeft/offsetWidth at that moment captures a stale, in-between size
  // and locks the track to the wrong target — it only looked right on the
  // very first mount, where there's no resize transition racing it. These
  // constants must match `.carousel-track { gap }` and
  // `.donut-slot.selected { margin }` in index.html.
  const GAP = 24, SEL_MARGIN = 28;
  const measure = () => {
    const track = trackRef.current, viewport = viewportRef.current;
    if (!track || !viewport) return;
    let pos = 0, selCenter = 0;
    roots.forEach((r, i) => {
      const w = i === selectedIndex ? BIG_SIZE : THUMB_SIZE;
      const m = i === selectedIndex ? SEL_MARGIN : 0;
      pos += m;
      if (i === selectedIndex) selCenter = pos + w / 2;
      pos += w + m;
      if (i < roots.length - 1) pos += GAP;
    });
    track.style.transform = `translateX(${-selCenter}px)`;
    const overflowing = pos > viewport.clientWidth + 1;
    setOverflow({
      left: overflowing && selectedIndex > 0,
      right: overflowing && selectedIndex < roots.length - 1,
    });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (!mountedRef.current) {
      // Skip the transition for the very first layout so donuts don't slide
      // in from translateX(0) on page load.
      track.style.transition = "none";
      measure();
      void track.offsetHeight; // force reflow so "none" applies before we clear it
      track.style.transition = "";
      mountedRef.current = true;
    } else {
      measure();
    }
    // eslint-disable-next-line
  }, [selectedIndex, roots.length]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line
  }, [selectedIndex, roots.length]);

  const step = (delta) => {
    const next = roots[selectedIndex + delta];
    if (next) onSelect(next.id);
  };

  return html`
    <div className="carousel-viewport" ref=${viewportRef}>
      <div className="carousel-track" ref=${trackRef}>
        ${roots.map((r, i) => {
          const isSel = i === selectedIndex;
          const t = trees[r.id];
          const sorted = isSel ? selectedSorted : sortedChildren(t);
          const freeSpace = isSel ? selectedFreeSpace : (t ? t.freeSpace : 0);
          const size = isSel ? BIG_SIZE : THUMB_SIZE;
          return html`<div key=${r.id} className=${"donut-slot" + (isSel ? " selected" : "")}>
            ${t
              ? html`<${PieChart} items=${sorted} freeSpace=${freeSpace}
                  size=${size} interactive=${isSel}
                  hovered=${isSel ? hovered : null}
                  setHovered=${isSel ? setHovered : (() => {})}
                  onSliceClick=${isSel ? onSliceClick : undefined}
                  onSelect=${() => onSelect(r.id)}/>`
              : html`<div className="donut-ring placeholder"
                  style=${{ width: size + "px", height: size + "px" }}
                  onClick=${() => onSelect(r.id)}></div>`}
            ${!isSel && html`<div className="donut-label">${r.name}</div>`}
          </div>`;
        })}
      </div>
      <div className=${"edge-fade left" + (overflow.left ? " show" : "")}></div>
      <div className=${"edge-fade right" + (overflow.right ? " show" : "")}></div>
      ${overflow.left && html`<button className="chevron left" onClick=${() => step(-1)}>‹</button>`}
      ${overflow.right && html`<button className="chevron right" onClick=${() => step(1)}>›</button>`}
    </div>`;
}

function PieChart({ items, freeSpace, hovered, setHovered, onSliceClick,
                     size = BIG_SIZE, interactive = true, onSelect }) {
  const cx = 140, cy = 140, outerR = 130, innerR = 75; // fixed internal geometry; CSS drives displayed size
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
    const r = (interactive && hovered === s.key) ? outerR + 6 : outerR;
    const a0 = s.start, a1 = s.start + s.sweep;
    const x1 = cx + Math.cos(a0)*r, y1 = cy + Math.sin(a0)*r;
    const x2 = cx + Math.cos(a1)*r, y2 = cy + Math.sin(a1)*r;
    const ix1 = cx + Math.cos(a0)*innerR, iy1 = cy + Math.sin(a0)*innerR;
    const ix2 = cx + Math.cos(a1)*innerR, iy2 = cy + Math.sin(a1)*innerR;
    const la = s.sweep > Math.PI ? 1 : 0;
    return `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${la} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${la} 0 ${ix1} ${iy1}`;
  };

  const hi = interactive && hovered != null
    ? (frame.find(s => s.key === hovered) || {}).item
    : null;
  const usedTotal = total - (freeSpace || 0);

  return html`<svg viewBox="0 0 280 280"
      style=${{ width: size + "px", height: size + "px",
        transition: "width 0.45s cubic-bezier(.4,0,.2,1), height 0.45s cubic-bezier(.4,0,.2,1)",
        cursor: interactive ? "default" : "pointer" }}
      onClick=${!interactive ? onSelect : undefined}>
      ${frame.map(s => html`<path key=${s.key} d=${arc(s)} fill=${s.color}
        stroke="#0f172a" strokeWidth="2"
        style=${{cursor: interactive ? ((s.item && s.item.children) ? "pointer" : "default") : "inherit",
          opacity: interactive && hovered !== null && hovered !== s.key ? 0.45 : 1,
          transition: "opacity 0.2s"}}
        onMouseEnter=${interactive ? () => setHovered(s.key) : undefined}
        onMouseLeave=${interactive ? () => setHovered(null) : undefined}
        onClick=${interactive ? () => s.item && s.item.children && onSliceClick(s.item) : undefined}/>`)}
      ${interactive && html`<text x=${cx} y=${cy-8} textAnchor="middle" fill="#e2e8f0"
        style=${{fontSize:"13px", fontFamily:"'DM Sans',sans-serif"}}>
        ${hi ? hi.name : "Total used"}</text>`}
      ${interactive && html`<text x=${cx} y=${cy+14} textAnchor="middle" fill="#f8fafc"
        style=${{fontSize:"18px", fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>
        ${hi ? formatSize(hi.size) : formatSize(usedTotal)}</text>`}
    </svg>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App}/>`);
