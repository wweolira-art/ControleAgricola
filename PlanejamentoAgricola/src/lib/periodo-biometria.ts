export function periodoBiometria(hoje = new Date()) {
  const ano = hoje.getFullYear();
  return {
    inicio: `${hoje.getMonth() >= 8 ? ano : ano - 1}-09-01`,
    fim: `${ano}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`,
  };
}
