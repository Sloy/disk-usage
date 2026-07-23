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
          <p className="subtitle">${currentNode ? formatSize(currentNode.size || (currentNode.children||[]).reduce((s,c)=>s+c.size,0)) + " used" : "No scan yet"}</p>
        </div>
      </div>
      ${!tree && html`<p className="scan-time">No data for this disk yet — a scan is running.</p>`}
      ${currentNode && html`<${Body}
        root=${currentRoot} tree=${tree} currentNode=${currentNode}
        namePath=${resolved.resolvedPath}
        hovered=${hovered} setHovered=${setHovered}
        navigateTo=${navigateTo} />`}
    </div>`;
}

// Placeholder — fleshed out in later tasks.
function Body({ currentNode }) {
  const sorted = [...(currentNode.children || [])].sort((a, b) => b.size - a.size);
  return html`<div>${sorted.map(c => html`<div key=${c.name}>${c.name} — ${formatSize(c.size)}</div>`)}</div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App}/>`);
