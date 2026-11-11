const fs=require('fs');
const lines=fs.readFileSync('PlanejamentoAgricola/src/components/CostCenter.tsx','utf8').split('\n');
for(const [a,b] of [[37,64],[275,370],[389,430]])console.log(lines.slice(a,b).join('\n'));
