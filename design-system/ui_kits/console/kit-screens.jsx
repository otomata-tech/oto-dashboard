/* Console screens — Overview, Connectors, Organization. Composed entirely
   from the design-system components. Fake data mirrors the product's IA. */
const NSs = window.OtoConsoleDesignSystem_517927;

/* ── Overview ─────────────────────────────────────────────────────────── */
function Overview({ onToast, onNavigate }) {
  const { Card, Stat, Tag, Dot, Quota, Button, Seg, CheckStep, CopyField, PageHeader, DayBars } = NSs;
  const [v, setV] = React.useState("status");
  const health = [["serper", "olive", "live"], ["google workspace", "olive", "linked"], ["crunchbase", "terra", "re-auth"]];
  return (
    <React.Fragment>
      <PageHeader dot="olive" eyebrow="studio open · all systems nominal"
        actions={<Seg options={["status", "activity"]} value={v} onChange={setV} />} />
      {v === "status" ? (
        <React.Fragment>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            <Stat label="connectors live" value="7" unit="/ 12" sub="api keys resolvable" />
            <Stat label="sessions" value="2" unit="/ 2" sub="crunchbase · google" />
            <Stat label="calls · 7 days" value="1,204" spark={[4,6,5,9,7,11,8]} sub="12 errors · 1%" />
            <Stat label="active org" value="Otomata" sub="you · org_admin" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 16 }}>
            <Card title="connector health" sub="what your tools can reach right now">
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                {health.map(([n, t, s]) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--color-hair-soft)" }}>
                    <Dot tone={t} size={7} />
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-ink)" }}>{n}</code>
                    <span style={{ marginLeft: "auto" }}><Tag tone={t}>{s}</Tag></span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="mcp endpoint" sub="point your client here">
              <CopyField value="https://mcp.oto.cx/sse" />
              <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                <Button kind="accent" onClick={() => onNavigate("/connectors")}>Ajouter une clé</Button>
                <Button kind="link" onClick={() => onToast("monitoring")}>Monitoring →</Button>
              </div>
            </Card>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card title="calls · last 7 days" sub="terra segments are failures.">
              <DayBars data={[[38,2],[52,0],[44,3],[61,1],[49,0],[70,4],[58,1]]} />
            </Card>
            <Card title="next step" sub="4 of 6 done — finish setting up.">
              <div style={{ marginBottom: 4 }}><Quota used={4} total={6} label="" /></div>
              <CheckStep n={5} last title="write your agent readme"
                action={<Button kind="mini" onClick={() => onNavigate("/procedures")}>Ouvrir l'éditeur →</Button>}>
                injected at the start of every session: business context, crm rules, tone, guardrails.
              </CheckStep>
            </Card>
          </div>
        </React.Fragment>
      ) : (
        <Card title="calls · last 7 days" sub="aggregate activity across all callers.">
          <DayBars data={[[38,2],[52,0],[44,3],[61,1],[49,0],[70,4],[58,1]]} height={110} />
        </Card>
      )}
    </React.Fragment>
  );
}

/* ── Connectors ───────────────────────────────────────────────────────── */
function Connectors({ onToast }) {
  const { Card, Button, Tag, Dot, Input, Icon, Table, Menu, MenuItem, IconButton } = NSs;
  const [q, setQ] = React.useState("");
  const all = [
    { name: "Serper", kind: "web search", state: "live", tone: "olive" },
    { name: "Hunter", kind: "email finder", state: "live", tone: "olive" },
    { name: "Recherche Entreprises", kind: "open data · FR", state: "live", tone: "olive" },
    { name: "Google Workspace", kind: "gmail · drive · sheets", state: "linked", tone: "olive" },
    { name: "Brevo", kind: "session", state: "expiring", tone: "saffron" },
    { name: "Crunchbase", kind: "session", state: "re-auth", tone: "terra" },
    { name: "Pipedrive", kind: "crm", state: "not set", tone: "faint" },
  ];
  const rows = all.filter((c) => (c.name + c.kind).toLowerCase().includes(q.toLowerCase()));
  const cols = [
    { key: "d", label: "", width: 20, render: (r) => <Dot tone={r.tone} size={7} /> },
    { key: "name", label: "provider", render: (r) => <span style={{ fontWeight: 600, color: "var(--color-ink)" }}>{r.name}</span> },
    { key: "kind", label: "kind", render: (r) => <span style={{ color: "var(--color-faint)" }}>{r.kind}</span> },
    { key: "state", label: "status", render: (r) => <Tag tone={r.tone}>{r.state}</Tag> },
    { key: "a", label: "", align: "right", render: (r) => (
      <Menu align="right" trigger={<IconButton icon="ellipsis" label="actions" />}>
        <MenuItem icon={r.state === "not set" ? "plus" : "pencil"} onClick={() => onToast((r.state === "not set" ? "connect " : "manage ") + r.name)}>{r.state === "not set" ? "connect" : "manage"}</MenuItem>
        <MenuItem icon="refresh-cw" onClick={() => onToast("rotate " + r.name)}>rotate key</MenuItem>
        <MenuItem icon="trash-2" danger onClick={() => onToast("remove " + r.name)}>remove</MenuItem>
      </Menu>
    ) },
  ];
  return (
    <React.Fragment>
      <Card sub="connect provider credentials so your agents' tools can call out. keys stay server-side.">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 11, color: "var(--color-faint)", display: "inline-flex" }}><Icon name="search" size={15} /></span>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search connectors…" style={{ paddingLeft: 33 }} />
          </div>
          <Button kind="accent" icon="plus" onClick={() => onToast("paste a key to connect")}>Ajouter une clé</Button>
        </div>
      </Card>
      <Card title="catalogue" sub={rows.length + " providers"} flush>
        <Table columns={cols} rows={rows} />
      </Card>
    </React.Fragment>
  );
}

/* ── Organization ─────────────────────────────────────────────────────── */
function Organization({ onToast }) {
  const { Card, Button, Tag, Avatar, Table, Switch, Field, CopyField, IconButton, Menu, MenuItem } = NSs;
  const [dense, setDense] = React.useState(false);
  const members = [
    { name: "Jean-Baptiste", email: "jb@oto.ninja", role: "admin", tone: "ink" },
    { name: "Camille", email: "camille@oto.ninja", role: "membre", tone: "neutral" },
    { name: "Yanis", email: "yanis@oto.ninja", role: "membre", tone: "neutral" },
  ];
  const cols = [
    { key: "a", label: "", width: 34, render: (r) => <Avatar name={r.name} size={26} /> },
    { key: "name", label: "membre", render: (r) => <span style={{ fontWeight: 600, color: "var(--color-ink)" }}>{r.name}</span> },
    { key: "email", label: "email", mono: true },
    { key: "role", label: "rôle", render: (r) => <Tag tone={r.tone}>{r.role}</Tag> },
    { key: "x", label: "", align: "right", render: (r) => (
      <Menu align="right" trigger={<IconButton icon="ellipsis" label="actions" />}>
        <MenuItem icon="pencil" onClick={() => onToast("edit " + r.name)}>change role</MenuItem>
        <MenuItem icon="trash-2" danger onClick={() => onToast("remove " + r.name)}>remove</MenuItem>
      </Menu>
    ) },
  ];
  return (
    <React.Fragment>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="members" sub="everyone in Otomata inherits the org's shared keys."
          actions={<Button kind="mini" icon="plus" onClick={() => onToast("invite a teammate")}>Inviter</Button>} flush>
          <Table columns={cols} rows={members} />
        </Card>
        <Card title="settings">
          <Field label="densité" hint="resserre les listes et les cartes.">
            <Switch checked={dense} onChange={() => setDense(!dense)} label="mode dense" />
          </Field>
        </Card>
      </div>
      <Card title="shared secrets" sub="org-level keys, resolvable by every member's agents.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CopyField value="SERPER_API_KEY = ••••••••••••••••" />
          <CopyField value="HUNTER_API_KEY = ••••••••••••••••" />
        </div>
      </Card>
    </React.Fragment>
  );
}

window.Overview = Overview;
window.Connectors = Connectors;
window.Organization = Organization;
