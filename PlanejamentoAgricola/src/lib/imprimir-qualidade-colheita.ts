/** Imprime apenas o painel, preservando os gráficos canvas no relatório. */
export async function imprimirQualidadeColheita(painel: HTMLElement): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = "PDF — Qualidade colheita";
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1400px;height:1000px;border:0";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Impressão indisponível");
    doc.title = "Qualidade colheita";
    const base = doc.createElement("base");
    base.href = document.baseURI;
    doc.head.appendChild(base);
    const estilos = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    const carregamentos = estilos.map((original) => {
      const copia = original.cloneNode(true) as HTMLElement;
      const pronto = copia.tagName === "LINK"
        ? new Promise<void>((resolve, reject) => {
            copia.onload = () => resolve();
            copia.onerror = () => reject(new Error("Falha ao carregar estilos"));
          })
        : Promise.resolve();
      doc.head.appendChild(copia);
      return pronto;
    });
    const copia = painel.cloneNode(true) as HTMLElement;
    // Congela a aparência da tela para que regras de impressão e o tamanho do
    // papel não reorganizem os cartões nem alterem suas cores e fontes.
    const originais = [painel, ...painel.querySelectorAll<HTMLElement>("*")];
    const copias = [copia, ...copia.querySelectorAll<HTMLElement>("*")];
    originais.forEach((original, index) => {
      const estilo = window.getComputedStyle(original);
      for (const propriedade of Array.from(estilo)) {
        copias[index].style.setProperty(propriedade, estilo.getPropertyValue(propriedade), "important");
      }
    });
    copia.querySelectorAll(".no-print").forEach((el) => el.remove());
    const graficos = painel.querySelectorAll("canvas");
    copia.querySelectorAll("canvas").forEach((canvas, index) => {
      const grafico = graficos[index];
      const imagem = doc.createElement("img");
      imagem.src = grafico.toDataURL("image/png");
      imagem.alt = grafico.closest(".qualidade-dash-card")?.querySelector("h4")?.textContent ?? "Gráfico";
      imagem.style.cssText = canvas.style.cssText;
      imagem.style.setProperty("display", "block", "important");
      canvas.replaceWith(imagem);
    });
    copia.querySelectorAll("select").forEach((select) => {
      const texto = doc.createElement("span");
      const original = painel.querySelector("select");
      texto.textContent = original?.selectedOptions[0]?.textContent ?? "—";
      texto.style.cssText = select.style.cssText;
      texto.style.setProperty("display", "inline-flex", "important");
      texto.style.setProperty("align-items", "center", "important");
      select.replaceWith(texto);
    });
    copia.querySelectorAll('input[type="date"]').forEach((input) => {
      const texto = doc.createElement("span");
      const valor = (input as HTMLInputElement).value;
      texto.textContent = valor ? valor.split("-").reverse().join("/") : "—";
      texto.style.cssText = (input as HTMLElement).style.cssText;
      texto.style.setProperty("display", "inline-flex", "important");
      texto.style.setProperty("align-items", "center", "important");
      input.replaceWith(texto);
    });
    doc.body.appendChild(copia);
    const ajustes = doc.createElement("style");
    ajustes.textContent = `
      @page { size: A4 landscape; margin: 8mm; }
      html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
      body { display: block !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    `;
    doc.head.appendChild(ajustes);
    await Promise.all(carregamentos);
    await Promise.all(Array.from(doc.images).map((img) => img.decode()));
    await doc.fonts.ready;
    copia.style.setProperty("height", "auto", "important");
    copia.style.setProperty("min-height", "0", "important");
    copia.style.setProperty("margin", "0", "important");
    // A4 horizontal, descontando 8 mm de margem em cada lado.
    const pxPorMm = 96 / 25.4;
    const escala = Math.min(
      1,
      (281 * pxPorMm) / copia.getBoundingClientRect().width,
      (194 * pxPorMm) / copia.getBoundingClientRect().height,
    );
    copia.style.setProperty("zoom", String(escala), "important");
    await new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
    win.focus();
    win.print();
  } finally {
    // Mantém o documento disponível enquanto a visualização de impressão está aberta.
    setTimeout(() => frame.remove(), 60_000);
  }
}
