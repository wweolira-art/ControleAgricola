import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {abrirRepositorioBiometria,ErroBiometriaLocal} from './agrocontrol-biometria-repositorio.js';
type Usuario={idUsuario:number;nome:string;perfil:string};
const prefixo='/api/integracoes/agrocontrol/biometria';
export function criarRecebedorBiometria(opcoes:{banco:()=>string;token:()=>string}) {
  let repo:ReturnType<typeof abrirRepositorioBiometria>|undefined;
  const repositorio=()=>repo??(repo=abrirRepositorioBiometria(opcoes.banco()));
  const json=(res:ServerResponse,status:number,dados:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(dados));};
  return {
    fechar(){repo?.fechar();repo=undefined;},
    async atender(req:IncomingMessage&{body?:unknown;originalUrl?:string},res:ServerResponse):Promise<boolean>{
      const url=new URL(req.originalUrl??req.url??'','http://integracao.local');
      if(!url.pathname.startsWith(prefixo+'/'))return false;
      try{
        const token=opcoes.token().trim();if(token.length<32)throw new ErroBiometriaLocal(503,'Configure AGROCONTROL_INTEGRACAO_TOKEN no ControleAgricola.');
        const recebido=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]??'';
        const hash=(texto:string)=>createHash('sha256').update(texto).digest();
        if(!recebido||!timingSafeEqual(hash(recebido),hash(token)))throw new ErroBiometriaLocal(401,'Chave de integração inválida.');
        const rota=url.pathname.slice(prefixo.length);
        if(rota==='/saude'&&req.method==='GET'){repositorio();json(res,200,{ok:true,destino:'controle-agricola-local',protocolo:1});return true;}
        let usuario:Usuario;
        try{
          const cabecalho=req.headers['x-agrocontrol-actor'];if(typeof cabecalho!=='string'||cabecalho.length>2048)throw Error();
          usuario=JSON.parse(Buffer.from(cabecalho,'base64url').toString('utf8'));
          if(!Number.isSafeInteger(usuario?.idUsuario)||usuario.idUsuario<=0||typeof usuario.nome!=='string'||!usuario.nome.trim()||usuario.nome.length>200||!['admin','operador'].includes(usuario.perfil))throw Error();
        }catch{throw new ErroBiometriaLocal(400,'Identificação do usuário da integração inválida.');}
        if(rota==='/lancamentos'&&req.method==='POST'){
          let dados=req.body;
          if(dados===undefined){let tamanho=0;const partes:Buffer[]=[];for await(const parte of req){const b=Buffer.isBuffer(parte)?parte:Buffer.from(parte);tamanho+=b.length;if(tamanho>262144)throw new ErroBiometriaLocal(413,'Lote de biometria muito grande.');partes.push(b);}try{dados=JSON.parse(Buffer.concat(partes).toString('utf8'));}catch{throw new ErroBiometriaLocal(400,'JSON biométrico inválido.');}}
          const entradas=dados&&typeof dados==='object'&&'entradas' in dados?dados.entradas:undefined;
          json(res,200,repositorio().gravar(entradas,usuario));
        }else if(rota==='/lancamentos'&&req.method==='GET')json(res,200,repositorio().listar());
        else if(rota==='/motivos-talhao'&&req.method==='GET')json(res,200,repositorio().motivos({data:url.searchParams.get('data')??undefined,codFazenda:url.searchParams.get('codFazenda')??undefined,codTalhao:url.searchParams.get('codTalhao')??undefined}));
        else if(/^\/lancamentos\/\d+$/.test(rota)&&req.method==='DELETE'){repositorio().excluir(Number(rota.split('/').at(-1)),usuario);json(res,200,{ok:true});}
        else json(res,404,{mensagem:'Rota de integração biométrica não encontrada.'});
      }catch(erro){json(res,erro instanceof ErroBiometriaLocal?erro.status:500,{mensagem:erro instanceof ErroBiometriaLocal?erro.message:'Não foi possível gravar ou consultar a biometria no ControleAgricola.'});}
      return true;
    },
  };
}
