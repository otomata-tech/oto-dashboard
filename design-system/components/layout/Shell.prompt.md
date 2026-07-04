One-line: The full console shell — dark ink sidebar + main column — composed from the layout parts.

```jsx
<Shell sidebar={
  <Sidebar
    brand={<Identity org="Otomata" kicker="votre contexte" role="admin" />}
    foot={<UserMenu name="Jean-Baptiste" email="jb@oto.ninja" />}
  >
    <SidebarGroup>
      <SidebarItem icon="overview" active>overview</SidebarItem>
      <SidebarItem icon="context">context</SidebarItem>
    </SidebarGroup>
    <SidebarGroup label="workspace">
      <SidebarItem icon="connectors" count="7/12">connectors</SidebarItem>
    </SidebarGroup>
  </Sidebar>
}>
  <Topbar title="overview" crumb="app.oto.ninja" actions={<OrgPill name="Otomata" />} />
  <Content>
    <PageHeader dot="olive" eyebrow="studio open · all systems nominal" />
    …cards…
  </Content>
</Shell>
```

Exports across the layout group: `Shell`, `Content`, `Sidebar`, `SidebarGroup`, `SidebarItem`, `Identity`, `UserMenu`, `Topbar`, `OrgPill`, `PageHeader`. The sidebar is deliberately dark (ink) for high contrast against the light content — active nav items fill solid saffron.
