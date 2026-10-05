import { type ReactNode, type RefObject, useRef, useState } from "react";
import { copyVisualElement, copyVisualElements } from "../lib/copy-visual";

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M11 5V3.4A1.4 1.4 0 0 0 9.6 2H3.4A1.4 1.4 0 0 0 2 3.4v6.2A1.4 1.4 0 0 0 3.4 11H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CopyStatusIcon({ state }: { state: "ok" | "err" }) {
  if (state === "ok") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M3.5 8.3 6.4 11.2 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CopyVisualButton({
  targetRef,
  label = "Copiar visual",
}: {
  targetRef: RefObject<HTMLElement | null>;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");

  const copy = async () => {
    try {
      const target = targetRef.current;
      if (!target) throw new Error("Visual ainda não carregou.");
      await copyVisualElement(target);
      setState("ok");
    } catch (error) {
      console.error("[copy-visual]", error);
      setState("err");
    }
    window.setTimeout(() => setState("idle"), 2500);
  };

  const title =
    state === "ok"
      ? "Copiado — no PowerPoint, selecione os valores e mude o tamanho da fonte"
      : state === "err"
        ? "Não foi possível copiar"
        : `${label} — cola no PowerPoint como tabela editável`;

  return (
    <button
      type="button"
      className="btn copy-visual-btn no-print"
      onClick={() => void copy()}
      title={title}
      aria-label={title}
    >
      {state === "idle" ? <CopyIcon /> : <CopyStatusIcon state={state} />}
    </button>
  );
}

export function CopyableVisual({
  className,
  title,
  controls,
  children,
}: {
  className?: string;
  title: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <article ref={ref} className={className}>
      <header>
        {typeof title === "string" ? <h3>{title}</h3> : title}
        <div className="entrada-cana-filters">
          {controls}
          <CopyVisualButton targetRef={ref} />
        </div>
      </header>
      {children}
    </article>
  );
}

export function CopyGroupCheckbox() {
  return (
    <label className="copy-group-pick no-print" title="Incluir este visual na cópia em grupo">
      <input type="checkbox" className="copy-group-check" />
      <span>Grupo</span>
    </label>
  );
}

export function CopyGroupBar({ scopeRef }: { scopeRef: RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");

  const selectedRoots = () => {
    const scope = scopeRef.current ?? document;
    return [...scope.querySelectorAll<HTMLInputElement>(".copy-group-check:checked")]
      .map((input) => input.closest<HTMLElement>("[data-copy-root]"))
      .filter((root): root is HTMLElement => Boolean(root));
  };

  const copySelected = async () => {
    try {
      await copyVisualElements(selectedRoots());
      setState("ok");
    } catch (error) {
      console.error("[copy-visual]", error);
      setState("err");
    }
    window.setTimeout(() => setState("idle"), 2500);
  };

  const clear = () => {
    const scope = scopeRef.current ?? document;
    for (const input of scope.querySelectorAll<HTMLInputElement>(".copy-group-check:checked")) {
      input.checked = false;
    }
  };

  return (
    <div className="copy-group-bar no-print">
      <p>Marque Grupo nos visuais e copie todos de uma vez. No PowerPoint, selecione os valores e mude o tamanho da fonte.</p>
      <button type="button" className="btn primary" onClick={() => void copySelected()}>
        {state === "ok" ? "Copiado" : state === "err" ? "Falhou" : "Copiar selecionados"}
      </button>
      <button type="button" className="btn" onClick={clear}>
        Limpar seleção
      </button>
    </div>
  );
}

export function CopyableKpis({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="copyable-kpis-wrap">
      <CopyVisualButton targetRef={ref} />
      <div ref={ref} className={className} data-copy-title={title}>
        {children}
      </div>
    </div>
  );
}
