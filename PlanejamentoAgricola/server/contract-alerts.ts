import { db } from "./db.js";
import { refreshContractEmissions } from "./contracts.js";
import { contractToday, contractScheduledDate as scheduledDate, contractNeedsAlert } from "../src/lib/contract-alert-status.js";

type ContractForAlert = {
  id: number;
  contratoJatoba: string;
  empresa: string;
  codigoUnico: string;
  nascimentoEmail: string;
  cpfCnpj: string;
  fazendaLocal: string;
  prioridade: "alta" | "media" | "normal";
};

const ALERT_INTERVAL_MS = 20 * 60 * 1000;

function telegramSettings() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const rawChatIds = process.env.TELEGRAM_CHAT_IDS ?? process.env.TELEGRAM_CHAT_ID ?? "";
  const chatIds = [...new Set(rawChatIds.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean))];
  return token && chatIds.length ? { token, chatIds } : null;
}

function escapeTelegramHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatContract(contract: ContractForAlert) {
  const prioridade = contract.prioridade === "alta" ? "🔴 Alta" : contract.prioridade === "media" ? "🟡 Média" : "🔵 Normal";
  const rows = [
    ["Prioridade", prioridade],
    ["Contrato Jatobá", contract.contratoJatoba],
    ["Empresa", contract.empresa],
    ["Contrato Equatorial", contract.codigoUnico],
    ["CPF/CNPJ", contract.cpfCnpj],
    ["Nascimento/E-mail", contract.nascimentoEmail],
    ["Fazenda/Local", contract.fazendaLocal],
  ].filter(([, value]) => Boolean(String(value ?? "").trim()));
  const width = 19;
  const table = [
    "CAMPO".padEnd(width) + " │ INFORMAÇÃO",
    "─".repeat(width) + "─┼─" + "─".repeat(23),
    ...rows.map(([label, value]) => `${label.padEnd(width)} │ ${escapeTelegramHtml(value)}`),
  ];
  return `<pre>${table.join("\n")}</pre>`;
}

export async function sendDueContractVerificationAlerts() {
  await refreshContractEmissions();
  const telegram = telegramSettings();
  if (!telegram) return { sent: 0, configured: false };

  const today = contractToday();
  const [year, month, day] = today.split("-");
  const all = db.prepare(`SELECT id, contrato_jatoba, empresa, codigo_unico, cpf_cnpj, nascimento_email, fazenda_local, prioridade, emissao
                            FROM contract_controls`).all() as Array<Record<string, unknown>>;
  const lastSentForContract = db.prepare("SELECT sent_at FROM contract_verification_alerts WHERE contract_id = ? AND competencia = ?");
  const due = all
    .filter((row) => {
      const date = scheduledDate(row.emissao);
      // O aviso começa no próprio dia da data de emissão configurada.
      if (date == null || !contractNeedsAlert(row.emissao, today)) return false;
      const lastAlert = lastSentForContract.get(Number(row.id), date) as { sent_at?: string } | undefined;
      const elapsed = Date.now() - Date.parse(lastAlert?.sent_at ?? "");
      return !Number.isFinite(elapsed) || elapsed >= ALERT_INTERVAL_MS;
    })
    .map((row) => ({
      id: Number(row.id),
      contratoJatoba: String(row.contrato_jatoba ?? ""),
      empresa: String(row.empresa ?? ""),
      codigoUnico: String(row.codigo_unico ?? ""),
      cpfCnpj: String(row.cpf_cnpj ?? ""),
      nascimentoEmail: String(row.nascimento_email ?? ""),
      fazendaLocal: String(row.fazenda_local ?? ""),
      prioridade: row.prioridade === "alta" || row.prioridade === "media" ? row.prioridade : "normal",
    }));

  if (!due.length) return { sent: 0, configured: true };

  const text = [
    `⚠️ <b>Contas Equatorial para verificar — ${day}/${month}/${year}</b>`,
    "Contas com emissão prevista para hoje ou já vencida:",
    ...due.map(formatContract),
  ].join("\n");
  for (const chatId of telegram.chatIds) {
    const response = await fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
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
