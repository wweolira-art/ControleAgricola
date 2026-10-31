import type {Express} from 'express';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dbPath} from './db.js';
import {criarRecebedorBiometria} from './agrocontrol-biometria-recebedor.js';
function tokenIntegracao():string{
  if(process.env.AGROCONTROL_INTEGRACAO_TOKEN?.trim())return process.env.AGROCONTROL_INTEGRACAO_TOKEN.trim();
  // A configuração acompanha a pasta do projeto, inclusive em C:\ControleAgricola.
  const arquivo=join(dirname(fileURLToPath(import.meta.url)),'..','.env');
  if(!existsSync(arquivo))return '';
  for(const linha of readFileSync(arquivo,'utf8').split(/\r?\n/)){
    const m=linha.match(/^\s*AGROCONTROL_INTEGRACAO_TOKEN\s*=\s*(.*?)\s*$/);if(m)return m[1].replace(/^(?:"|')|(?:"|')$/g,'');
  }
  return '';
}
export function registerAgroControlBiometriaRoutes(app:Express){
  const recebedor=criarRecebedorBiometria({banco:()=>dbPath,token:tokenIntegracao});
  app.use('/api/integracoes/agrocontrol/biometria',(req,res,next)=>{void recebedor.atender(req,res).then(atendeu=>{if(!atendeu)next();}).catch(next);});
}
