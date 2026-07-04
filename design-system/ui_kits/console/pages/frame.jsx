/* Frame — the reusable console page skeleton (Shell + Sidebar + Topbar +
   Content), composed from the design system. Base for any new screen. */
const NS_FR = window.OtoConsoleDesignSystem_517927;

function Frame({ title, crumb, active = "/overview", narrow = false, children }) {
  const { Shell, Content, Sidebar, SidebarGroup, SidebarItem, Identity, UserMenu, Topbar, OrgPill, Dot } = NS_FR;
  const item = (p, i, l, count) => <SidebarItem icon={i} count={count} active={active === p}>{l}</SidebarItem>;
  return (
    <Shell sidebar={
      <Sidebar
        brand={<Identity org="Otomata" kicker="votre contexte" role="admin" />}
        foot={
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sidebar-fg-mute)" }}><Dot tone="olive" size={7} /> mcp connected</div>
            <UserMenu name="Jean-Baptiste" email="jb@oto.ninja" />
          </div>
        }
      >
        <SidebarGroup>
          {item("/overview", "overview", "overview")}
          {item("/context", "context", "context")}
        </SidebarGroup>
        <SidebarGroup label="workspace">
          {item("/projects", "projects", "projects")}
          {item("/connectors", "connectors", "connectors", "7/12")}
          {item("/procedures", "procedures", "procédures")}
        </SidebarGroup>
        <SidebarGroup label="memory">
          {item("/data", "data", "données")}
          {item("/documents", "documents", "documents")}
        </SidebarGroup>
      </Sidebar>
    }>
      <Topbar title={title} crumb={crumb} actions={<OrgPill name="Otomata" />} />
      <Content narrow={narrow}>{children}</Content>
    </Shell>
  );
}
window.Frame = Frame;
