import type { Express } from "express";

const AUTORGAS_API_URL = "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/acompanhamentoprazo/";

async function relayOracleError(response: Response) {
  const text = await response.text();
  throw new Error(text || `A API Autorgas retornou HTTP ${response.status}.`);
}

export function registerAutorgasRoutes(app: Express) {
  app.get("/api/autorgas", async (_req, res) => {
    try {
      const response = await fetch(AUTORGAS_API_URL);
      if (!response.ok) throw await relayOracleError(response);
      res.json(await response.json());
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível consultar os acompanhamentos Autorgas." });
    }
  });

  app.post("/api/autorgas", async (req, res) => {
    try {
      const response = await fetch(AUTORGAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body ?? {}),
      });
      if (!response.ok) throw await relayOracleError(response);
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) return res.status(201).json(await response.json());
      return res.status(201).send(await response.text());
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível inserir o acompanhamento Autorgas." });
    }
  });
}
