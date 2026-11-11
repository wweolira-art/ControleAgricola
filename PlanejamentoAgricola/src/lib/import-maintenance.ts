import type { Activity, LineItem } from "../api";

export function shouldAllocateMaintenance(
  categoryName: string,
  line: Pick<LineItem, "ref_kind" | "item_type" | "activity_id">,
  activities: Pick<Activity, "id">[],
) {
  const category = categoryName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const maintenance = category === "despesa c manutencao" || category === "despesas com manutencao";
  const equipmentOrActivity = line.ref_kind === "activity" || line.ref_kind === "cost_object" || line.item_type === "E";
  const materialE = line.ref_kind === "material" && line.item_type === "E";
  return maintenance && equipmentOrActivity && !materialE && line.activity_id != null
    && activities.some((activity) => activity.id === line.activity_id);
}
