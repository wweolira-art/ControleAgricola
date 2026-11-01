type UsuarioRecord = { id_usuario: number; cod_funcionario?: number | null; [key: string]: unknown };

/** ORDS PUT substitui o registro: mantém também os campos não editados na tela. */
export async function persistUsuarioUpdate(
  target: string, current: UsuarioRecord, changes: Record<string, unknown>, transport: typeof fetch = fetch,
): Promise<UsuarioRecord> {
  const { links: _links, ...stored } = current;
  const response = await transport(target, {
    method: "PUT", cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ ...stored, ...changes, id_usuario: current.id_usuario }),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = `HTTP ${response.status}`;
    try { const data = JSON.parse(text); message = data.message || data.error || message; } catch { /* Não expõe corpo bruto do cadastro. */ }
    throw new Error(`Não foi possível atualizar o usuário: ${message}`);
  }
  const check = await transport(target, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!check.ok) throw new Error("A atualização foi enviada, mas não foi possível confirmar a gravação. Consulte o cadastro novamente.");
  const saved = await check.json() as UsuarioRecord;
  if (Number(saved.id_usuario) !== current.id_usuario) throw new Error("A API retornou um cadastro diferente ao confirmar a gravação.");
  if ("cod_funcionario" in changes && (saved.cod_funcionario == null ? null : Number(saved.cod_funcionario)) !== changes.cod_funcionario) {
    throw new Error("A API não gravou o código do funcionário. A alteração não foi confirmada.");
  }
  return saved;
}
