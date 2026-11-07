import {initialExportLocations,type ExportLocation} from './analise-solo-compusoft';
import {normalizeSoil,type SoilRow} from './analise-solo';
export type SoilAssociation={source:string;status:'complete'|'partial'|'review';location:ExportLocation;reason:string;candidates:Array<{fazenda:number;name:string;zonas:number[];talhoes:number[]}>};
export function completeVerifiedLocations(rows:SoilRow[],catalog:SoilAssociation[],manual:Record<string,ExportLocation>):Record<string,ExportLocation>{
 const defaults=applySoilAssociations(rows,catalog);
 for(const name of Object.keys(defaults)){
  const current=manual[name];if(!current)continue;
  defaults[name]={fazenda:current.fazenda??defaults[name].fazenda,talhao:current.talhao??defaults[name].talhao,zona:current.zona??defaults[name].zona,estagio:current.estagio??null,producao:current.producao??null};
 }
 return defaults;
}
export function applySoilAssociations(rows:SoilRow[],catalog:SoilAssociation[],saved:Record<string,ExportLocation>={}):Record<string,ExportLocation>{
 const result=initialExportLocations(rows);
 for(const name of Object.keys(result)){
  const item=catalog.find(c=>normalizeSoil(c.source)===normalizeSoil(name));
  if(item)result[name]={...result[name],...item.location};
  const previous=saved[name];
  if(previous&&['fazenda','talhao','zona'].every(k=>{const v=previous[k as keyof ExportLocation];return v==null||Number.isSafeInteger(v)&&v>0;})){
   result[name]={...result[name],fazenda:previous.fazenda??result[name].fazenda,talhao:previous.talhao??result[name].talhao,zona:previous.zona??result[name].zona};
  }
 }
 return result;
}
