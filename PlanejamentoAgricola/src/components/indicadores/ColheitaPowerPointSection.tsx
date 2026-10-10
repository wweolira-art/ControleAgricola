import { useMemo, useState } from "react";
import { api } from "../../api";
import { loadDeckLayout, saveDeckLayout, type DeckLayout } from "../../lib/gestao-desempenho-layout";
import { pneuDescarteLookbackFrom } from "../../lib/pneus";
import { createImageOnlyPptx, downloadPptx } from "../../lib/pptx-lite";
import { ColheitaPowerPointLayout } from "./ColheitaPowerPointLayout";
import {
  SLIDE_H,
  SLIDE_W,
  buildGestaoDesempenhoSlides,
  nomeArquivoGestao,
  safraPeriodo,
  type GestaoDeckInput,
  type SlideSpec,
} from "../../lib/gestao-desempenho-slides";

function formatPeriodo(inicio: string, fim: string) {
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split("-");
    return year && month && day ? `${day}/${month}/${year}` : iso;
  };
  return `${fmt(inicio)} a ${fmt(fim)}`;
}

async function loadDataUrl(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base.endsWith("/") ? base : `${base}/`}${path}`;
  const response = await fetch(url);
  if (!response.ok) return "";
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blob);
  });
}

async function svgToPng(svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SLIDE_W;
    canvas.height = SLIDE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível gerar o slide.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
    ctx.drawImage(image, 0, 0, SLIDE_W, SLIDE_H);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Não foi possível gerar PNG."))), "image/png"),
    );
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadOrNull<T>(promise: Promise<T>, errors: string[]) {
  try {
    return await promise;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function ColheitaPowerPointSection({
  dataInicio,
  dataFim,
}: {
  dataInicio: string;
  dataFim: string;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [layout, setLayout] = useState<DeckLayout>(() => loadDeckLayout());
  const periodo = useMemo(() => formatPeriodo(dataInicio, dataFim), [dataFim, dataInicio]);
  const slidesAtivos = layout.slides.filter((item) => item.enabled).length;

  function updateLayout(next: DeckLayout) {
    setLayout(next);
    saveDeckLayout(next);
  }

  async function gerar() {
    const errors: string[] = [];
    try {
      setLoading(true);
      setStatus("Consultando produção, manutenção, qualidade, óleo, lubrificação e pneus...");
      const safra = safraPeriodo(dataFim);
      const anoLub = Number(dataFim.slice(0, 4));
      const gestao = (
        categoria: string,
        inicio: string,
        fim: string,
        modo: "indicadores" | "custo",
      ) => api.indicadoresGestaoManutencao({ dataInicio: inicio, dataFim: fim, categoria, modo });

      const [
        semana,
        safraProd,
        horasSemana,
        horasSafra,
        qualidade,
        oleo,
        lub,
        pneus,
        colhedoraSemana,
        colhedoraSafra,
        tratorSemana,
        tratorSafra,
        caminhaoSemana,
        caminhaoSafra,
        custoColhedoraSemana,
        custoColhedoraSafra,
        custoTratorSemana,
        custoTratorSafra,
        capaUrl,
        logoUrl,
      ] = await Promise.all([
        loadOrNull(api.indicadoresColheitaProducao({ dataInicio, dataFim, refDate: dataFim, modo: "entrada" }), errors),
        loadOrNull(api.indicadoresColheitaProducao({ dataInicio: safra.inicio, dataFim, refDate: dataFim, modo: "entrada" }), errors),
        loadOrNull(api.indicadoresColheitaProducao({ dataInicio, dataFim, refDate: dataFim, modo: "horas" }), errors),
        loadOrNull(api.indicadoresColheitaProducao({ dataInicio: safra.inicio, dataFim, refDate: dataFim, modo: "horas" }), errors),
        loadOrNull(api.indicadoresColheitaQualidade({ dataInicio: safra.inicio, dataFim }), errors),
        loadOrNull(api.indicadoresColheitaOleoHidraulico({ dataInicio: safra.inicio, dataFim }), errors),
        loadOrNull(api.indicadoresLubrificacao({ ano: anoLub }), errors),
        loadOrNull(api.indicadoresPneus({ view: "descarte", from: pneuDescarteLookbackFrom(dataFim), to: dataFim }), errors),
        loadOrNull(gestao("COLHEDORA", dataInicio, dataFim, "indicadores"), errors),
        loadOrNull(gestao("COLHEDORA", safra.inicio, dataFim, "indicadores"), errors),
        loadOrNull(gestao("TRATORES", dataInicio, dataFim, "indicadores"), errors),
        loadOrNull(gestao("TRATORES", safra.inicio, dataFim, "indicadores"), errors),
        loadOrNull(gestao("CAMINHÕES", dataInicio, dataFim, "indicadores"), errors),
        loadOrNull(gestao("CAMINHÕES", safra.inicio, dataFim, "indicadores"), errors),
        loadOrNull(gestao("COLHEDORA", dataInicio, dataFim, "custo"), errors),
        loadOrNull(gestao("COLHEDORA", safra.inicio, dataFim, "custo"), errors),
        loadOrNull(gestao("TRATORES", dataInicio, dataFim, "custo"), errors),
        loadOrNull(gestao("TRATORES", safra.inicio, dataFim, "custo"), errors),
        loadOrNull(loadDataUrl("gestao-desempenho-capa.jpg"), errors),
        loadOrNull(loadDataUrl("elejota-logo.png"), errors),
      ]);

      const anyData = semana || safraProd || horasSemana || oleo || qualidade || colhedoraSemana || pneus;
      if (!anyData) throw new Error(errors[0] || "Não foi possível consultar os indicadores do período.");
      if (!layout.slides.some((item) => item.enabled)) throw new Error("Marque ao menos um slide para gerar a apresentação.");

      setStatus("Montando os slides no modelo Gestão de desempenho...");
      const deck: GestaoDeckInput = {
        inicio: dataInicio,
        fim: dataFim,
        safraInicio: safra.inicio,
        safraCode: safra.code,
        semana,
        safra: safraProd,
        horasSemana,
        horasSafra,
        qualidade,
        colhedoraSemana,
        colhedoraSafra,
        tratorSemana,
        tratorSafra,
        caminhaoSemana,
        caminhaoSafra,
        custoColhedoraSemana,
        custoColhedoraSafra,
        custoTratorSemana,
        custoTratorSafra,
        oleo,
        lub,
        pneus,
        capaUrl: capaUrl ?? "",
        logoUrl: logoUrl ?? "",
      };
      const specs = buildGestaoDesempenhoSlides(deck, layout);
      const slides: Array<{ title: string; png: Uint8Array }> = [];
      for (let index = 0; index < specs.length; index += 1) {
        const spec: SlideSpec = specs[index]!;
        if (spec.svg.includes("NaN")) throw new Error(`Não foi possível montar o slide ${spec.title}.`);
        setStatus(`Gerando slide ${index + 1} de ${specs.length}...`);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        slides.push({ title: spec.title, png: await svgToPng(spec.svg) });
      }
      downloadPptx(createImageOnlyPptx(slides), nomeArquivoGestao(dataInicio, dataFim));
      const aviso = errors.length ? ` Alguns painéis ficaram sem dados (${errors.length} consulta(s) não retornaram).` : "";
      setStatus(`PowerPoint gerado com ${slides.length} slides para ${periodo}.${aviso}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel colheita-ppt-panel">
      <div>
        <p className="eyebrow">PowerPoint</p>
        <h2>Gestão de desempenho</h2>
        <p className="lead">
          Gera a apresentação no modelo do relatório semanal: capa, pauta e os painéis de produtividade, horas,
          disponibilidade, qualidade, combustível, manutenção, óleo hidráulico, lubrificação e pneus. Cada indicador
          sai com a semana selecionada e o acumulado da safra.
        </p>
      </div>
      <div className="colheita-ppt-actions">
        <span>Período: {periodo}</span>
        <span>{slidesAtivos} slide(s) na apresentação</span>
        <button type="button" className="btn" onClick={() => setShowConfig((open) => !open)}>
          {showConfig ? "Fechar configuração" : "Configurar slides"}
        </button>
        <button type="button" className="btn primary" disabled={loading || slidesAtivos === 0} onClick={() => void gerar()}>
          {loading ? "Gerando..." : "Gerar PowerPoint"}
        </button>
      </div>
      {showConfig ? <ColheitaPowerPointLayout layout={layout} onChange={updateLayout} /> : null}
      {status ? <p className="lead colheita-ppt-status">{status}</p> : null}
    </section>
  );
}
