from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "analise-gestao-desempenho-06-12-nov-2026.pdf"

slides = [
    ("1. Capa", "Relatório referente a 06-12/11/2026, safra 26/27. Define o período-base da análise."),
    ("2. Escopo", "Abrange produtividade, combustível, disponibilidade, confiabilidade, custos, óleo hidráulico, lubrificação e pneus. Os indicadores devem ser lidos em conjunto."),
    ("3. Colhedoras - semana", "Disponibilidade média de 68,3% ante meta de 85%; produção de 2.042,72 t/dia ante 3.948; diesel de 1,52 L/t ante meta de 1,1. A baixa produção dilui o consumo por tonelada. 5001 e 5004 exigem prioridade."),
    ("4. Colhedoras - outubro", "A visão mensal deve confirmar se novembro é evento pontual ou continuidade. A manutenção de resultado abaixo da meta indica tendência, não ocorrência isolada."),
    ("5. Colhedoras - acumulado", "O acumulado mostra que a melhora pontual ainda não recuperou o desempenho da safra. A prioridade deve ser ampliar horas efetivas."),
    ("6. Tratores - semana", "Disponibilidade de 91,2%, acima da meta de 85%, e consumo dentro da meta. Porém a produção média foi 1.193,1 t/dia, só 52,7% da meta. Há indício de espera, frente insuficiente ou programação inadequada."),
    ("7. Tratores - novembro", "A disponibilidade não se converteu integralmente em produção. Cruzar horas de motor, horas produtivas, espera e deslocamento."),
    ("8. Tratores - acumulado", "A disponibilidade melhorou na safra, mas a produção não acompanhou. Investigar utilização produtiva e sincronização com a colheita."),
    ("9. Caminhões - semana", "Disponibilidade de 95%, acima da meta, mas 1.020,8 t/caminhão/dia ante meta de 1.579,2. Consumo de 0,77 L/km está próximo da meta. O gargalo provável é logístico, não mecânico."),
    ("10. Caminhões - novembro", "Medir o ciclo completo: carregamento, viagem carregada, descarga, retorno vazio e espera em frente, balança ou usina."),
    ("11. Caminhões - acumulado", "A alta disponibilidade e baixa produtividade reforçam hipótese de falha de despacho, rota, distância, carga média ou sincronização com colhedoras."),
    ("12. Horas das colhedoras", "Eficiência operacional de 47%: 1.478 horas trabalhadas para 6.432 disponíveis. Manutenção, horas sem produção e horas sem registro são as principais perdas de capacidade."),
    ("13. Horas dos tratores", "Aplicar a mesma leitura por máquina. Disponibilidade alta com produção baixa deve aparecer como espera, deslocamento, improdutividade ou falha de apontamento."),
    ("14. Qualidade da colheita - semana", "Perdas de 2,90% em Pau Paraíba. 5001 atingiu 3,02% e 5002, 2,85%. Estilhaço, tolete e toco mecanizado concentram as perdas; verificar regulagem, facas, velocidade e condição do canavial."),
    ("15. Qualidade acumulada", "Confirmar a persistência das perdas por máquina, operador e fazenda. Se recorrente, a correção deve ser técnica e não apenas pontual."),
    ("16. Combustível das colhedoras", "1,46 L/t na semana contra 1,1 de meta; a 5002 chegou a 1,86 L/t. Como L/h está próximo da meta, a principal causa é a baixa tonelagem por hora."),
    ("17. Combustível dos tratores", "Consumo por tonelada dentro da meta. O ponto de gestão permanece produtividade e utilização, não eficiência energética."),
    ("18. Combustível dos caminhões", "Consumo por quilômetro próximo da meta. O custo por tonelada aumenta quando carga média, giro de viagens ou produtividade caem."),
    ("19. Disponibilidade das colhedoras", "54,63% semanal e 56,15% acumulada, muito abaixo de 85%. Este é o principal limitador físico da produção."),
    ("20. Disponibilidade dos tratores", "91,14% semanal e 80,05% acumulada. A semana é boa; o acumulado revela histórico de indisponibilidade, especialmente no início da safra."),
    ("21. Disponibilidade dos caminhões", "91,60% semanal e 97,13% acumulada. A oficina de caminhões não explica a baixa produtividade de transporte."),
    ("22. Confiabilidade das colhedoras - semana", "MTBF total de 14h20, abaixo da meta de 15h; MTTR de 6h52, acima da meta de 3h. A 5003 ficou com 0% de disponibilidade; validar parada total ou qualidade do cadastro."),
    ("23. Confiabilidade das colhedoras - acumulado", "MTBF de 15h07 atingiu a meta, mas MTTR de 11h48 é quase quatro vezes a meta. Reduzir espera por peça, diagnóstico e liberação do equipamento."),
    ("24. Confiabilidade dos tratores - semana", "Disponibilidade alta, mas MTBF de 62h18 está distante da meta de 180h. Há risco de recorrência de corretivas."),
    ("25. Confiabilidade dos tratores - acumulado", "MTBF de 49h14 e MTTR de 12h16. Os equipamentos 4017 e 4021 exigem revisão prioritária de histórico e modo de falha."),
    ("26. MTTR/MTBF - colhedoras", "MTTR semanal de 6h52 e MTBF de 14h48. O principal ganho está em reduzir o tempo de reparo, não somente reduzir a quantidade de falhas."),
    ("27. MTTR/MTBF - tratores", "MTTR semanal de 6h04 e MTBF de 62h18. Atacar falhas repetitivas, peças críticas e tempo de atendimento."),
    ("28. Custos das colhedoras", "R$ 103.883,04 em corretiva na semana, 99,98% do gasto; motor básico responde por R$ 81.333,49. A manutenção é predominantemente reativa."),
    ("29. Custos dos tratores", "Semana equilibrada entre corretiva e preventiva; no acumulado a preventiva representa 75,91%. Pneus são item relevante e requerem controle de vida, pressão, carga e rota."),
    ("30. Óleo hidráulico - resumo", "865,1 L em 27 remotas e 0,012 L/t, abaixo da meta de 0,013. Mecânica e lubrificação concentram 88% do volume."),
    ("31. Óleo hidráulico - detalhe", "A 5002 consumiu 428,4 L e a 5001, 266,6 L. Inspecionar vazamentos, mangueiras, cilindros, conexões e radiador hidráulico."),
    ("32. Óleo hidráulico - comparativo", "A safra 26/27 está em 0,011 L/t, melhor que as duas anteriores. Preservar o resultado com foco nos equipamentos de maior consumo absoluto."),
    ("33. Óleo hidráulico - causas", "Foram 8 vazamentos e 7 estouros. Corte de pontas, transmissão e rolos alimentadores concentram trocas; avaliar abrasão, fixação, pressão e contaminação."),
    ("34. Óleo hidráulico mensal", "Setembro ficou em 0,023 L/t, acima da meta; outubro caiu a 0,006 e novembro está em 0,010. A melhora deve ser acompanhada até o fechamento do mês."),
    ("35. Lubrificação", "Eficiência de 100%, 18 dias programados e realizados, sem pendências. É prática a preservar e relacionar à redução de consumo hidráulico após setembro."),
    ("36. Descarte de pneus", "14 pneus e R$ 25.620,14 de custo estimado. Vida média de 1,4 e sulco médio de 7,8 mm indicam descarte prematuro por dano; carcaça fatigada, corte e estouro predominam."),
    ("37. Comparativo de descartes", "Picos semanais devem ser cruzados com equipamento, rota, frente, chuva e condição de estrada para localizar causas operacionais."),
    ("38. Recapagem agrícola", "Compra estimada de R$ 13.617,00 versus reforma de R$ 9.360,00, gerando economia de R$ 4.257,00. Aplicar somente a carcaças aprovadas."),
    ("39. Recapagem rodoviária", "Compra estimada de R$ 97.550,29 versus reforma de R$ 42.062,00, economia de R$ 55.488,29. É a maior oportunidade financeira, sujeita a controle de carcaça e garantia."),
]

priorities = [
    ["1", "Colhedoras", "Recuperar 5001, 5003 e 5004 com plano por falha, peça, espera e responsável."],
    ["2", "Tempo de reparo", "Reduzir MTTR das colhedoras, hoje 11h48 acumuladas, com peças críticas e escalonamento."],
    ["3", "Apontamentos", "Auditar horas sem registro e sem produção por máquina, turno e frente."],
    ["4", "Qualidade", "Intervir em 5001 e 5002: regulagem, facas, velocidade, operador e condição do canavial."],
    ["5", "Logística", "Medir ciclo dos caminhões e espera dos tratores para explicar baixa produção com alta disponibilidade."],
    ["6", "Óleo e pneus", "Inspecionar 5002/5001 para óleo hidráulico e tratar descarte prematuro de pneus como falha operacional."],
]


def page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#1E4E79"))
    canvas.setLineWidth(1)
    canvas.line(doc.leftMargin, A4[1] - 1.45 * cm, A4[0] - doc.rightMargin, A4[1] - 1.45 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#536878"))
    canvas.drawString(doc.leftMargin, 0.9 * cm, "Controle Agrícola | Análise de gestão de desempenho")
    canvas.drawRightString(A4[0] - doc.rightMargin, 0.9 * cm, f"Página {doc.page}")
    canvas.restoreState()


def p(text, style):
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24,
                           leading=29, textColor=colors.HexColor("#0C2A4D"), alignment=TA_CENTER, spaceAfter=12)
    subtitle = ParagraphStyle("Subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=12,
                              leading=17, textColor=colors.HexColor("#47677D"), alignment=TA_CENTER)
    heading = ParagraphStyle("Heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14,
                             leading=18, textColor=colors.HexColor("#0C2A4D"), spaceBefore=12, spaceAfter=7)
    slide_title = ParagraphStyle("SlideTitle", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=10.2,
                                 leading=13, textColor=colors.HexColor("#0C2A4D"), spaceAfter=2)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2,
                          leading=13.2, textColor=colors.HexColor("#1F2937"), spaceAfter=7)
    callout = ParagraphStyle("Callout", parent=body, backColor=colors.HexColor("#EAF2F7"), borderColor=colors.HexColor("#AFC7D9"),
                             borderWidth=0.5, borderPadding=9, spaceBefore=4, spaceAfter=9)

    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=1.55 * cm, leftMargin=1.55 * cm,
                            topMargin=2.0 * cm, bottomMargin=1.45 * cm, title="Análise de Gestão de Desempenho")
    story = [Spacer(1, 2.6 * cm), p("Análise de Gestão de Desempenho", title),
             p("Manutenção automotiva | Semana de 06 a 12 de novembro de 2026", subtitle), Spacer(1, 0.9 * cm),
             p("Objetivo", heading),
             p("Analisar os 39 slides do relatório de gestão, consolidando evidências dos indicadores do sistema, hipóteses de causa e prioridades práticas de ação.", body),
             p("Critério de interpretação: os números reproduzem os painéis exportados pelo sistema. As causas classificadas como hipóteses exigem validação no histórico de O.S., apontamentos, frente de trabalho, operador e logística.", callout),
             p("Resumo executivo", heading),
             p("O principal limitador é a colheita: disponibilidade semanal das colhedoras de 54,63%, frente à meta de 85%, com eficiência operacional de 47%. Tratores e caminhões apresentaram disponibilidade acima da meta, mas produtividade insuficiente; isso sugere gargalo de utilização e logística além da manutenção.", body),
             PageBreak(), p("Leitura slide a slide", heading)]

    for name, text in slides:
        story.append(KeepTogether([p(name, slide_title), p(text, body)]))

    story += [PageBreak(), p("Prioridades de ação", heading)]
    table_header = ParagraphStyle("TableHeader", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8,
                                  leading=10, textColor=colors.white)
    table_data = [[p("Prioridade", table_header), p("Frente", table_header), p("Ação recomendada", table_header)]]
    for row in priorities:
        table_data.append([p(cell, body) for cell in row])
    table = Table(table_data, colWidths=[1.8 * cm, 3.0 * cm, 10.0 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0C2A4D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B9CBD9")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F7FAFC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F7FAFC"), colors.HexColor("#EAF2F7")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [table, Spacer(1, 0.5 * cm), p("Fonte: relatório Gestão de Desempenho - 06.11a 12.11.2026 - Copia.pdf, exportado do sistema.", body)]
    doc.build(story, onFirstPage=page, onLaterPages=page)


if __name__ == "__main__":
    main()
