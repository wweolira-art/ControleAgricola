O LocalIP foi incorporado ao PlanejamentoAgricola. `npm run dev` e o serviço Windows sobem o publicador (`Publish.ps1`) junto com o app, na porta 5173.

# LocalIP 2.0 — serviço do Windows

O instalável está em **dist/LocalIP-Setup.exe**. É independente: pode ser copiado para outro computador Windows. A criação do executável não instala nem configura serviços neste computador.

## Instalar quando desejar

1. Execute `LocalIP-Setup.exe` e autorize a execução como administrador.
2. Confira o adaptador de rede e informe a porta do site (sugestão inicial: 5173).
3. Clique em **Instalar**. Somente nesse momento são criados os arquivos, o serviço e o início automático.

Compatível com Windows 10/11 com .NET Framework 4.x. Não precisa de Python, Node ou baixar dependências. O executável não possui assinatura digital de um editor comercial.

A instalação cria o serviço **LocalIPAgent**, executado pela conta LocalService, com início automático atrasado. Funciona antes do login e continua ativo quando o painel fecha. Publica ao iniciar e repete a verificação/envio **a cada 30 minutos**, mesmo se o IPv4 continuar igual. Em caso de falha, registra o erro e tenta no próximo ciclo. Cada requisição tem limite de 20 segundos; consultas paginadas podem envolver várias requisições. Não há envios concorrentes dentro do serviço.

Se o adaptador selecionado ficar indisponível, registra a falha e aguarda, sem trocar de rede. O modo automático prioriza adaptadores conectados com gateway. Confira a seleção se houver VPN ou várias redes.

## Acompanhar, parar e iniciar

Abra **LocalIP - Painel** no menu Iniciar. Exibe estado real do serviço, IPv4, última tentativa, último sucesso, próxima verificação e as últimas 100 linhas de histórico.

- **Parar serviço:** interrompe os envios e cancela a requisição em andamento. Retorna ao clicar em Iniciar ou no próximo boot se o início automático estiver marcado.
- **Iniciar:** retoma o serviço e verifica imediatamente.
- **Verificar agora:** verifica sem esperar os 30 minutos.
- **Salvar:** aplica porta/adaptador e início automático. Se ativo, verifica imediatamente.
- Desmarque **Iniciar automaticamente** e clique em **Salvar** para impedir a partida no próximo boot. Use também **Parar serviço** para interromper a execução atual.
- **Abrir site:** abre `http://IPV4:PORTA/`. O site precisa estar rodando e acessível na rede.

Minimizar recolhe o painel para a bandeja, ao lado do relógio. Fechar encerra somente o painel. O painel pede administrador para controlar o serviço; o serviço opera como LocalService.

## Arquivos e desinstalação

- Programa: `%ProgramFiles%\LocalIP\LocalIP.exe`.
- Configurações, status e histórico: `%ProgramData%\LocalIP`.
- Histórico: `historico.log`, com rotação ao ultrapassar 1 MB e uma cópia anterior.

Desinstale em **Configurações do Windows > Aplicativos > LocalIP**. A remoção para e exclui o serviço, remove início automático e atalho. O executável em uso é removido na próxima reinicialização; reinicie antes de reinstalar. Configurações e histórico são preservados.

A pasta de dados permite escrita somente a administradores, SYSTEM e LocalService. O aplicativo anterior (`LocalIP.ps1`) e seu `config.json` foram preservados como versão antiga; não os execute junto com o serviço. O instalador não importa o índice de adaptador antigo, que varia entre computadores. `Iniciar.bat` abre o painel instalado ou o instalador.

## API e prevenção de duplicatas

Destino padrão: https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/localip/

```json
{"servidor":"NOME-DO-PC","numeroip":"192.168.1.10","porta":5173,"ativo":"S"}
```

Consulta a coleção ORDS e suas páginas, procura `servidor` ignorando maiúsculas/minúsculas e espaços externos e faz **PUT** no link `self` do registro (ou no ID retornado). Se a consulta completa confirmar que não existe, faz **POST**. Falha de consulta ou atualização nunca provoca POST de fallback. Duplicatas existentes bloqueiam escrita e aparecem no histórico. HTTP 2xx confirma recebimento, não persistência no banco.

A garantia de uma linha por servidor em chamadas simultâneas depende também do índice único no Oracle. Os modelos `oracle/preparar-tabela.sql` e `oracle/handler-post.sql` continuam disponíveis e **não foram aplicados ao banco**. `numeroip` deve ser textual e o handler deve preservar `ativo` em `PUT` e gravar `ativo = 'S'` no upsert do servidor atual. O cliente requer GET/PUT/POST compatíveis com esse contrato. O instalador não altera banco nem handlers ORDS.

## Compilar e testar sem instalar

```powershell
.\Build.ps1
.\Test.ps1
```

Utiliza o compilador C# do .NET Framework do Windows. Os testes usam API simulada em loopback, pasta temporária e renderização oculta da interface. Não instalam serviços, não configuram início automático e não enviam à API real. Cobrem atualização por servidor, inserção, paginação, erros HTTP, timeout, cancelamento, duplicatas, persistência e ciclo do worker.

A instalação/desinstalação real e a integração com Oracle precisam ser verificadas quando você instalar; não foram executadas neste computador, conforme solicitado.
