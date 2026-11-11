import { db } from "./db.js";

export type EstimativaEnergiaLinha = {
  id: number;
  contratoJatoba: string;
  descricao: string;
  mediaSafra: number;
  mediaEntressafra: number;
};

type LinhaEntrada = Omit<EstimativaEnergiaLinha, "id">;

function numero(valor: unknown) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : 0;
}

export function listarEstimativaEnergia(safraId: number): EstimativaEnergiaLinha[] {
  if (!Number.isInteger(safraId) || safraId <= 0) throw new Error("Informe uma safra válida.");
  return db.prepare(
    `SELECT id,
            contrato_jatoba AS contratoJatoba,
            descricao,
            media_safra AS mediaSafra,
            media_entressafra AS mediaEntressafra
       FROM estimativa_detalhada_energia
      WHERE safra_id = ?
      ORDER BY ordem, id`,
  ).all(safraId) as EstimativaEnergiaLinha[];
}

export function salvarEstimativaEnergia(safraId: number, linhas: LinhaEntrada[]) {
  if (!Number.isInteger(safraId) || safraId <= 0) throw new Error("Informe uma safra válida.");
  if (!Array.isArray(linhas)) throw new Error("Informe as linhas da estimativa.");

  const inserir = db.prepare(
    `INSERT INTO estimativa_detalhada_energia
      (safra_id, contrato_jatoba, descricao, media_safra, media_entressafra, ordem)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare("DELETE FROM estimativa_detalhada_energia WHERE safra_id = ?").run(safraId);
    linhas.forEach((linha, ordem) => {
      inserir.run(
        safraId,
        String(linha.contratoJatoba ?? "").trim(),
        String(linha.descricao ?? "").trim(),
        numero(linha.mediaSafra),
        numero(linha.mediaEntressafra),
        ordem,
      );
    });
  })();
  return listarEstimativaEnergia(safraId);
}
