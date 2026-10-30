import { FormEvent, useState } from "react";
import { LoginCaneBackground } from "./LoginCaneBackground";

export function Login({
  onLogin,
  loading,
  error,
}: {
  onLogin: (identifier: string, password: string, persistSession?: boolean) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const busy = submitting || loading;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalErr(null);
    if (!identifier.trim() || !password) {
      setLocalErr("Informe e-mail ou código do funcionário e senha.");
      return;
    }
    setSubmitting(true);
    try {
      await onLogin(identifier.trim(), password, saveOnDevice);
      if (saveOnDevice) {
        const browser = navigator as Navigator & { credentials?: { store: (credential: unknown) => Promise<unknown> } };
        const PasswordCredential = (window as typeof window & {
          PasswordCredential?: new (data: { id: string; password: string; name: string }) => unknown;
        }).PasswordCredential;
        if (PasswordCredential && browser.credentials?.store) {
          void browser.credentials.store(new PasswordCredential({ id: identifier.trim(), password, name: identifier.trim() })).catch(() => undefined);
        }
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  const message = localErr || error;

  return (
    <div className="login-page">
      <LoginCaneBackground />
      <div className="login-cane-logo" role="img" aria-label="Elejota Agro" />
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-wrap">
            <img
              src="/elejota-agro-logo.png"
              alt="Elejota Agro"
              className="login-logo"
            />
          </div>
          <small>Controle Agrícola</small>
          <h1>Entrar</h1>
          <p>Use o e-mail ou código do funcionário e a senha cadastrados.</p>
        </div>

        <form className="login-form" onSubmit={(e) => void submit(e)}>
          <label>
            E-mail ou código do funcionário
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Ex.: 12345 ou seu e-mail"
              disabled={busy}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              disabled={busy}
            />
          </label>
          <label className="login-save-access">
            <input
              type="checkbox"
              checked={saveOnDevice}
              onChange={(e) => setSaveOnDevice(e.target.checked)}
              disabled={busy}
            />
            <span>
              Salvar e-mail e senha neste dispositivo
              <small>O navegador solicitará a confirmação para guardar o acesso com segurança.</small>
            </span>
          </label>
          {message ? (
            <p className="login-error" role="alert">
              {message}
            </p>
          ) : null}
          <button type="submit" className="btn primary login-submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
