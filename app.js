// app.js  (real app added in Task 6)
const html = htm.bind(React.createElement);
ReactDOM.createRoot(document.getElementById("root"))
  .render(html`<div style=${{padding: "40px", color: "#e2e8f0"}}>Loading…</div>`);
