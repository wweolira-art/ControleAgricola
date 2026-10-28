import { db } from "./db.js";

type ContractForAlert = {
  id: number;
  contratoJatoba: string;
  codigoUnico: string;
  nascimentoEmail: string;
  fazendaLocal: string;
  prioridade: "alta" | "media" | "normal";
};

const TIME_ZONE = "America/Fortaleza";
const ALERT_INTERVAL_MS = 20 * 60 * 1000;

function nowInFortaleza() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: Number(get("day")) };
}

/** Aceita a data ISO e os valores legados no formato dd/mm/aaaa. */
function scheduledDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!brazilian) return null;
  const [, day, month, year] = brazilian;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function telegramSettings() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const rawChatIds = process.env.TELEGRAM_CHAT_IDS ?? process.env.TELEGRAM_CHAT_ID ?? "";
  const chatIds = [...new Set(rawChatIds.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean))];
  return token && chatIds.length ? { token, chatIds } : null;
}

function formatContract(contract: ContractForAlert) {
  const details = [
    contract.prioridade === "alta" ? "🔴 Prioridade alta" : contract.prioridade === "media" ? "🟡 Prioridade média" : "🔵 Prioridade normal",
    `Contrato Jatobá: ${contract.contratoJatoba}`,
    contract.codigoUnico ? `Contrato Equatorial: ${contract.codigoUnico}` : "",
    contract.nascimentoEmail ? `Nascimento/E-mail: ${contract.nascimentoEmail}` : "",
    contract.fazendaLocal ? `Fazenda/Local: ${contract.fazendaLocal}` : "",
  ].filter(Boolean);
  return `• ${details.join(" | ")}`;
}

export async function sendDueContractVerificationAlerts() {
  const telegram = telegramSettings();
  if (!telegram) return { sent: 0, configured: false };

  const { year, month, day } = nowInFortaleza();
  const today = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const all = db.prepare(`SELECT id, contrato_jatoba, codigo_unico, nascimento_email, fazenda_local, prioridade, emissao
                            FROM contract_controls`).all() as Array<Record<string, unknown>>;
  const lastSentForContract = db.prepare("SELECT sent_at FROM contract_verification_alerts WHERE contract_id = ? AND competencia = ?");
  const due = all
    .filter((row) => {
      const date = scheduledDate(row.emissao);
      // O aviso começa no dia seguinte à data configurada.
      if (date == null || today <= date) return false;
      const lastAlert = lastSentForContract.get(Number(row.id), date) as { sent_at?: string } | undefined;
      const elapsed = Date.now() - Date.parse(lastAlert?.sent_at ?? "");
      return !Number.isFinite(elapsed) || elapsed >= ALERT_INTERVAL_MS;
    })
    .map((row) => ({
      id: Number(row.id),
      contratoJatoba: String(row.contrato_jatoba ?? ""),
      codigoUnico: String(row.codigo_unico ?? ""),
      nascimentoEmail: String(row.nascimento_email ?? ""),
      fazendaLocal: String(row.fazenda_local ?? ""),
      prioridade: row.prioridade === "alta" || row.prioridade === "media" ? row.prioridade : "normal",
    }));

  if (!due.length) return { sent: 0, configured: true };

  const text = [
    `⚠️ Contas Equatorial para verificar — ${day}/${month}/${year}`,
    "A data de emissão configurada já passou para as contas abaixo:",
    ...due.map(formatContract),
  ].join("\n");
  for (const chatId of telegram.chatIds) {
    const response = await fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) throw new Error(`Telegram retornou ${response.status}: ${await response.text()}`);
  }

  const sentAt = new Date().toISOString();
  const save = db.prepare(`INSERT INTO contract_verification_alerts (contract_id, competencia, sent_at) VALUES (?, ?, ?)
                           ON CONFLICT(contract_id, competencia) DO UPDATE SET sent_at = excluded.sent_at`);
  db.transaction(() => due.forEach((contract) => {
    const date = scheduledDate(all.find((row) => Number(row.id) === contract.id)?.emissao);
    if (date) save.run(contract.id, date, sentAt);
  }))();
  return { sent: due.length, configured: true };
}

export function startContractVerificationAlertSchedule() {
  const check = () => void sendDueContractVerificationAlerts().catch((error) => {
    console.error("Não foi possível enviar os avisos de contas Equatorial:", error instanceof Error ? error.message : error);
  });
  check();
  setInterval(check, ALERT_INTERVAL_MS).unref();
}
