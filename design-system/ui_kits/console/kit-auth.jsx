/* Auth screens — login + signup, split panel (dark brand + light form). */
const NSa = window.OtoConsoleDesignSystem_517927;

function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: 1, height: 1, background: "var(--color-hair)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-faint)" }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--color-hair)" }} />
    </div>
  );
}

function BrandPanel({ tag }) {
  const { OtoMark } = NSa;
  return (
    <div style={{ background: "var(--sidebar-bg)", display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, padding: 56 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <OtoMark variant="quad" size={46} />
        <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--sidebar-fg-strong)" }}>oto</span>
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: "var(--sidebar-fg)", maxWidth: 340 }}>{tag}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--sidebar-fg-mute)" }}>open source · app.oto.ninja</div>
    </div>
  );
}

const linkStyle = { background: "none", border: 0, padding: 0, fontSize: 12.5, fontWeight: 600, color: "var(--color-saffron-ink)", cursor: "pointer", textAlign: "left" };

function Login({ onLogin, onSignup }) {
  const { Button, Field, Input } = NSa;
  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "var(--color-bg)" }}>
      <BrandPanel tag="l'automatisation B2B, pilotée par vos agents — connecteurs, données publiques, CRM, le tout via MCP." />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, padding: 56, background: "var(--color-surface)" }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>connexion</div>
        <Field label="email"><Input placeholder="vous@entreprise.fr" /></Field>
        <Button kind="accent" onClick={onLogin} style={{ justifyContent: "center", marginTop: 2 }}>Se connecter</Button>
        <Divider label="ou" />
        <Button kind="ghost" icon="mail" onClick={onLogin} style={{ justifyContent: "center" }}>Continuer avec Google</Button>
        <button onClick={onSignup} style={{ ...linkStyle, marginTop: 4 }}>pas de compte ? rejoindre l'alpha →</button>
      </div>
    </div>
  );
}

function Signup({ onLogin, onSignup }) {
  const { Button, Field, Input } = NSa;
  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "var(--color-bg)" }}>
      <BrandPanel tag="rejoignez l'alpha. créez votre compte, branchez un client MCP, et vos agents agissent dès la première session." />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 13, padding: 56, background: "var(--color-surface)" }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>rejoindre oto</div>
        <Field label="nom"><Input placeholder="Jean-Baptiste" /></Field>
        <Field label="email pro"><Input placeholder="vous@entreprise.fr" /></Field>
        <Field label="organisation" hint="vous pourrez inviter votre équipe ensuite."><Input placeholder="Otomata" /></Field>
        <Button kind="accent" onClick={onSignup} style={{ justifyContent: "center", marginTop: 2 }}>Créer mon compte</Button>
        <button onClick={onLogin} style={{ ...linkStyle, marginTop: 4 }}>déjà un compte ? se connecter →</button>
      </div>
    </div>
  );
}

window.Login = Login;
window.Signup = Signup;
