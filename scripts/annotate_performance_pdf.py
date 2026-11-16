from pathlib import Path
import subprocess

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from generate_performance_analysis_pdf import slides


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\rayhiran\Downloads\Gestão de desempenho - 06.11a 12.11.2026 - Copia.pdf")
OUTPUT = ROOT / "output" / "pdf" / "gestao-desempenho-06-12-nov-2026-com-observacoes.pdf"
RENDER_DIR = ROOT / "tmp" / "pdfs" / "desempenho-anotado" / "slides"
PAGE_W, PAGE_H = landscape(A4)
MARGIN = 16
NOTE_Y = 16
NOTE_H = 112
SLIDE_Y = 145


def render_slides():
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    if len(list(RENDER_DIR.glob("slide-*.png"))) == len(slides):
        return
    for old_file in RENDER_DIR.glob("slide-*.png"):
        old_file.unlink()
    subprocess.run(
        ["pdftoppm", "-png", "-r", "150", str(SOURCE), str(RENDER_DIR / "slide")],
        check=True,
    )


def draw_note(pdf, index: int, heading: str, observation: str):
    pdf.setFillColor(colors.HexColor("#F3F8FC"))
    pdf.setStrokeColor(colors.HexColor("#23557B"))
    pdf.roundRect(MARGIN, NOTE_Y, PAGE_W - 2 * MARGIN, NOTE_H, 5, fill=1, stroke=1)
    pdf.setFillColor(colors.HexColor("#0C2A4D"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(MARGIN + 10, NOTE_Y + 72, f"OBSERVAÇÃO - SLIDE {index}: {heading}")
    style = ParagraphStyle("note", fontName="Helvetica", fontSize=8.6, leading=11,
                           textColor=colors.HexColor("#1F2937"))
    paragraph = Paragraph(observation, style)
    paragraph.wrap(PAGE_W - 2 * MARGIN - 20, NOTE_H - 28)
    paragraph.drawOn(pdf, MARGIN + 10, NOTE_Y + 15)
    pdf.setFillColor(colors.HexColor("#5D7181"))
    pdf.setFont("Helvetica", 6.8)
    pdf.drawRightString(PAGE_W - MARGIN, 6, f"Relatório anotado | Página {index}")


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    render_slides()
    images = sorted(RENDER_DIR.glob("slide-*.png"))
    if len(images) != len(slides):
        raise ValueError(f"Esperadas {len(slides)} páginas; recebidas {len(images)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H))
    pdf.setTitle("Gestão de desempenho - observações por slide")
    for index, (image_path, (heading, observation)) in enumerate(zip(images, slides), start=1):
        image = ImageReader(str(image_path))
        image_w, image_h = image.getSize()
        max_w = PAGE_W - 2 * MARGIN
        max_h = PAGE_H - SLIDE_Y - MARGIN
        scale = min(max_w / image_w, max_h / image_h)
        draw_w, draw_h = image_w * scale, image_h * scale
        x = (PAGE_W - draw_w) / 2
        y = SLIDE_Y + (max_h - draw_h) / 2
        pdf.drawImage(image, x, y, width=draw_w, height=draw_h)
        draw_note(pdf, index, heading, observation)
        pdf.showPage()
    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
