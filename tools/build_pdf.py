#!/usr/bin/env python3
"""Construye FLOW_REPORT.pdf con reportlab, incluyendo las imágenes."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak,
)

HERE = os.path.dirname(__file__)
IMG = os.path.join(HERE, "..", "report", "images")
OUT = os.path.join(HERE, "..", "report", "FLOW_REPORT.pdf")

SIT = [
    ("01_login.png", "1. Pantalla de login", "ok",
     "La app exige autenticarse para continuar.",
     "detectLoginWall lo detecta; el snapshot avisa «se necesita login».",
     "Abre la pantalla de login y pide snapshot (verás 🔐 y los campos)."),
    ("02_home.png", "2. Login correcto → Home", "ok",
     "Con credenciales válidas se navega al home.",
     "login rellena y envía; expect(home_title).toBeVisible() confirma; S0→S1.",
     "login {username,password} → assert_visible id=home_title → get_flow_graph."),
    ("03_permission.png", "3. Diálogo de permisos", "warn",
     "Un diálogo de sistema tapa la app y bloquea el flujo.",
     "detectSystemDialog + tool handle_system_dialog(accept).",
     "Provoca un permiso runtime → snapshot muestra 🛡️ → handle_system_dialog accept=true."),
    ("04_keyboard.png", "4. Teclado tapa el botón", "warn",
     "El teclado software cubre el botón de enviar.",
     "Device.hideKeyboard() / tool hide_keyboard (Android pulsa BACK).",
     "Enfoca un campo inferior, intenta tocar el botón → hide_keyboard y reintenta."),
    ("05_anr.png", "5. App no responde (ANR)", "bad",
     "La app se congela/crashea (diálogo «no responde»).",
     "detectAnr avisa 💥 en el snapshot.",
     "Fuerza un bloqueo del hilo principal → snapshot muestra el aviso."),
    ("06_offscreen.png", "6. Elemento fuera de pantalla", "warn",
     "Un ítem de lista larga no está en el árbol hasta hacer scroll.",
     "scrollIntoViewIfNeeded() y scroll automático en tap/fill y MCP.",
     "tap by=id value=product_42 en una lista larga: hace scroll solo."),
    ("07_webview.png", "7. WebView / app híbrida", "ok",
     "Pantalla con contenido web (WebView / web components).",
     "detectWebView lo anota; selectores por texto/a11y alcanzan el DOM accesible.",
     "Abre una pantalla con WebView → snapshot muestra 🌐. (DOM CSS vía CDP → Roadmap.)"),
    ("08_flowgraph.png", "8. Grafo de flujos", "ok",
     "Recorrer todos los flujos sin perderse ni repetir.",
     "Cada snapshot registra el estado; get_flow_graph da nodos+aristas (Mermaid).",
     "Explora con la IA y pide get_flow_graph."),
    ("09_rotation.png", "9. Rotación / orientación", "warn",
     "El dispositivo rota a horizontal y cambian las dimensiones.",
     "El tamaño se reconsulta (Android) y el swipe usa el área real.",
     "Rota el emulador y repite snapshot. (API de rotar → Roadmap.)"),
    ("10_rtl.png", "10. Layout RTL (árabe/hebreo)", "warn",
     "Idiomas de derecha a izquierda: UI espejada.",
     "Selectores por id/texto/a11y siguen funcionando; swipes y bidi requieren manejo.",
     "Cambia el locale a ar/he y recorre el flujo. (forward/back y bidi → Roadmap.)"),
    ("11_modal.png", "11. Modal / bottom sheet", "warn",
     "Una hoja inferior o modal se superpone.",
     "Se registra como estado nuevo; acotar la búsqueda a la capa superior.",
     "Abre un bottom sheet → snapshot. (Acotado a capa superior → Roadmap.)"),
]
BADGE = {"ok": ("CORRECTO", colors.HexColor("#1b873f")),
         "warn": ("DUDOSO / requiere manejo", colors.HexColor("#946c00")),
         "bad": ("INCORRECTO", colors.HexColor("#b00020"))}

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=22, spaceAfter=4)
SUB = ParagraphStyle("SUB", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#6b7280"))
H3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=13, spaceBefore=2, spaceAfter=4)
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontSize=9.5, leading=13)
BADGES = ParagraphStyle("BADGE", parent=styles["Normal"], fontSize=9, textColor=colors.white)

n_ok = sum(1 for s in SIT if s[2] == "ok")
n_warn = sum(1 for s in SIT if s[2] == "warn")
n_bad = sum(1 for s in SIT if s[2] == "bad")

story = []
story.append(Paragraph("Mobiwright — Reporte completo del flujo", H1))
story.append(Paragraph("Recorrido E2E, veredicto por situación e imágenes para replicar", SUB))
story.append(Spacer(1, 8))

summ = Table([[
    Paragraph(f"<b>{n_ok}</b> correcto(s)", BODY),
    Paragraph(f"<b>{n_warn}</b> dudoso(s)", BODY),
    Paragraph(f"<b>{n_bad}</b> incorrecto(s)", BODY),
]], colWidths=[55 * mm, 55 * mm, 55 * mm])
summ.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e6e8eb")),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e6e8eb")),
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fafbfc")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 10),
]))
story.append(summ)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "<b>Verificación ejecutada:</b> tsc sin errores · casos borde OK · "
    "demo del runner 4/4 passed · MCP 13 tools (grafo S0→S1).", BODY))
story.append(Spacer(1, 10))

for img, title, verdict, what, how, repl in SIT:
    label, color = BADGE[verdict]
    pic = Image(os.path.join(IMG, img))
    # escalar a ~58mm de ancho
    iw, ih = pic.imageWidth, pic.imageHeight
    w = 58 * mm
    pic.drawWidth = w
    pic.drawHeight = ih * (w / iw)
    badge = Table([[Paragraph(f"<b>{label}</b>", BADGES)]], colWidths=[None])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    txt = [
        badge, Spacer(1, 4),
        Paragraph(f"<b>{title}</b>", H3),
        Paragraph(f"<b>Qué ocurre:</b> {what}", BODY), Spacer(1, 2),
        Paragraph(f"<b>Manejo:</b> {how}", BODY), Spacer(1, 2),
        Paragraph(f"<b>Replicar:</b> {repl}", BODY),
    ]
    row = Table([[pic, txt]], colWidths=[62 * mm, 118 * mm])
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e6e8eb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(row)
    story.append(Spacer(1, 8))

story.append(PageBreak())
story.append(Paragraph("Limitaciones conocidas (Roadmap)", H3))
for it in ["Rotación y RTL: manejo parcial.",
           "DOM profundo en WebView (CSS) vía Chrome DevTools Protocol.",
           "Unicode/emojis en Android (IME de test).",
           "Paralelismo multi-dispositivo (workers > 1)."]:
    story.append(Paragraph("• " + it, BODY))

SimpleDocTemplate(OUT, pagesize=A4, topMargin=14 * mm, bottomMargin=14 * mm,
                  leftMargin=14 * mm, rightMargin=14 * mm).build(story)
print("PDF:", os.path.abspath(OUT), os.path.getsize(OUT), "bytes")
