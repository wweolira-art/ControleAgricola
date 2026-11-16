import { INDICADORES_CTT, INDICADORES_CTT_TRATOR } from "./indicador-ctt.js";
import { readMetaCtt } from "./metas-locais.js";
import type { MetasConsumoMapa } from "./mapa-consumo.js";

export function lerMetasConsumo(): MetasConsumoMapa {
  const ler = (grupo: "colhedora" | "trator", id: "dieselHr" | "dieselTon") => {
    const definicoes = grupo === "colhedora" ? INDICADORES_CTT : INDICADORES_CTT_TRATOR;
    return readMetaCtt(grupo, id, definicoes.find(def => def.id === id)!.meta);
  };
  return {
    colhedora: { ltHora: ler("colhedora", "dieselHr"), ltTon: ler("colhedora", "dieselTon") },
    trator: { ltHora: ler("trator", "dieselHr"), ltTon: ler("trator", "dieselTon") },
    caminhao: { ltHora: 0, ltTon: 1.1 },
  };
}
