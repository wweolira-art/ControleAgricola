import { useState } from "react";
import { MaterialsEntradaSaidaReport } from "../MaterialsEntradaSaidaReport";
import { IndicadoresGestaoMateriais } from "./IndicadoresGestaoMateriais";
import { MateriaisDashboard } from "./MateriaisDashboard";
import { AcompanhamentoPedido } from "./AcompanhamentoPedido";

type MateriaisView = "dashboard" | "gestao" | "acompanhamento-pedido" | "entrada-saida";

export function IndicadoresMateriais() {
  const [view, setView] = useState<MateriaisView>("dashboard");

  return (
    <>
      <div className="kind-toggle no-print" style={{ marginBottom: 10 }}>
        <button type="button" className={`btn ${view === "dashboard" ? "primary" : ""}`} onClick={() => setView("dashboard")}>
          Dashboard
        </button>
        <button
          type="button"
          className={`btn ${view === "acompanhamento-pedido" ? "primary" : ""}`}
          onClick={() => setView("acompanhamento-pedido")}
        >
          Acompanhamento pedido
        </button>
        <button type="button" className={`btn ${view === "gestao" ? "primary" : ""}`} onClick={() => setView("gestao")}>
          Gestão de estoque
        </button>
        <button
          type="button"
          className={`btn ${view === "entrada-saida" ? "primary" : ""}`}
          onClick={() => setView("entrada-saida")}
        >
          Entrada × saída
        </button>
      </div>
      {view === "dashboard" ? (
        <MateriaisDashboard />
      ) : view === "gestao" ? (
        <IndicadoresGestaoMateriais />
      ) : view === "acompanhamento-pedido" ? (
        <AcompanhamentoPedido />
      ) : (
        <MaterialsEntradaSaidaReport />
      )}
    </>
  );
}
