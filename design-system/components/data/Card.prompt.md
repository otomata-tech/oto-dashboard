One-line: The base surface of every console screen — white, 12px radius, hairline border, optional head with title/sub/actions.

```jsx
<Card title="connectors" sub="api keys resolvable for your tools"
      actions={<Button kind="mini" icon="plus">add a key</Button>}>
  …body…
</Card>

// full-bleed table:
<Card title="recent tools" flush>
  <table className="tbl">…</table>
</Card>
```

Use `flush` only when the body is a single full-width `table.tbl` or row list; wrap any other content in your own padded div. Compose cards inside `.grid2` / `.grid3` / `.grid23` layouts.
