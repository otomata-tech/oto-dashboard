One-line: The console button — a lowercase pill (primary/ghost) or small tooled button (mini/danger), plus an inline text link.

```jsx
<Button onClick={save}>save changes</Button>
<Button kind="ghost">cancel</Button>
<Button kind="mini" icon="plus">new project</Button>
<Button kind="danger" icon="trash">delete</Button>
<Button kind="link">monitoring →</Button>
```

Variants via `kind`: `primary` (filled ink, hover lifts), `ghost` (outlined), `mini` (surface + hairline, 7px radius — for cards/rows), `danger` (mini in terra), `link` (inline saffron-ink text). Labels are lowercase by convention. `icon` prepends a glyph from the Oto icon set. `disabled` dims to 50%.
