/* App — auth gate → console shell, composed from the design system. */
const NS = window.OtoConsoleDesignSystem_517927;

const META = {
  "/overview": { title: "overview", crumb: "app.oto.ninja" },
  "/context": { title: "ce que voit ton agent", crumb: "mon espace" },
  "/projects": { title: "projects", crumb: "workspace" },
  "/connectors": { title: "connectors", crumb: "workspace" },
  "/procedures": { title: "procédures", crumb: "workspace" },
  "/data": { title: "données", crumb: "memory" },
  "/documents": { title: "documents", crumb: "memory" },
  "/org": { title: "organization", crumb: "gérer mon org" },
};

function App() {
  const { Shell, Content, Sidebar, SidebarGroup, SidebarItem, Identity, UserMenu, Topbar, OrgPill, Dot, Toast, IconButton } = NS;
  const [authed, setAuthed] = React.useState(false);
  const [mode, setMode] = React.useState("login");
  const [screen, setScreen] = React.useState("/overview");
  const [toast, setToast] = React.useState(null);
  function fire(m) { setToast(m); clearTimeout(fire._t); fire._t = setTimeout(() => setToast(null), 1900); }

  if (!authed) {
    return mode === "login"
      ? <Login onLogin={() => setAuthed(true)} onSignup={() => setMode("signup")} />
      : <Signup onLogin={() => setMode("login")} onSignup={() => setAuthed(true)} />;
  }

  const meta = META[screen] || META["/overview"];
  const nav = (path, icon, label, count) => (
    <SidebarItem icon={icon} count={count} active={screen === path} onClick={() => setScreen(path)}>{label}</SidebarItem>
  );
  let body;
  if (screen === "/connectors") body = <Connectors onToast={fire} />;
  else if (screen === "/org") body = <Organization onToast={fire} />;
  else body = <Overview onToast={fire} onNavigate={setScreen} />;

  return (
    <React.Fragment>
      <Shell sidebar={
        <Sidebar
          brand={<Identity org="Otomata" kicker="votre contexte" role="admin" />}
          foot={
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sidebar-fg-mute)" }}><Dot tone="olive" size={7} /> mcp connected</div>
              <UserMenu name="Jean-Baptiste" email="jb@oto.ninja" onClick={() => fire("compte")} />
            </div>
          }
        >
          <SidebarGroup>
            {nav("/overview", "overview", "overview")}
            {nav("/context", "context", "context")}
          </SidebarGroup>
          <SidebarGroup label="workspace">
            {nav("/projects", "projects", "projects")}
            {nav("/connectors", "connectors", "connectors", "7/12")}
            {nav("/procedures", "procedures", "procédures")}
          </SidebarGroup>
          <SidebarGroup label="memory">
            {nav("/data", "data", "données")}
            {nav("/documents", "documents", "documents")}
          </SidebarGroup>
          <SidebarGroup label="gérer mon org">
            {nav("/org", "org", "organization")}
          </SidebarGroup>
        </Sidebar>
      }>
        <Topbar title={meta.title} crumb={meta.crumb}
          actions={<React.Fragment><OrgPill name="Otomata" /><IconButton icon="log-out" label="se déconnecter" onClick={() => { setAuthed(false); setMode("login"); setScreen("/overview"); }} /></React.Fragment>} />
        <Content>{body}</Content>
      </Shell>
      {toast ? <Toast>{toast}</Toast> : null}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
