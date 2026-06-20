#!/usr/bin/env python3
"""
Genera imágenes (mockups tipo pantalla móvil) de cada situación del flujo de
Mobiwright, para documentar el reporte y poder REPLICAR cada caso después.
Salida: report/images/*.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "report", "images")
os.makedirs(OUT, exist_ok=True)

W, H = 460, 900
BG = (240, 242, 245)
PHONE = (255, 255, 255)
INK = (28, 28, 30)
SUB = (110, 116, 124)
BLUE = (33, 99, 235)
GREEN = (27, 135, 63)
RED = (176, 0, 32)
AMBER = (148, 108, 0)


def font(sz, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


F = {
    "h": font(26, True), "t": font(20, True), "b": font(18),
    "s": font(15), "tiny": font(13), "badge": font(15, True),
}


def rrect(d, box, r, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def base(title, verdict, vcolor):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # marco del teléfono
    rrect(d, (16, 16, W - 16, H - 70), 36, PHONE, outline=(210, 214, 220), width=2)
    # notch
    rrect(d, (W // 2 - 45, 26, W // 2 + 45, 40), 7, (225, 228, 232))
    # status bar
    d.text((40, 54), "9:41", font=F["s"], fill=SUB)
    d.text((W - 90, 54), "▤  ▤  100%", font=F["tiny"], fill=SUB)
    # app bar
    rrect(d, (16, 78, W - 16, 130), 0, (248, 249, 251))
    d.text((40, 92), title, font=F["t"], fill=INK)
    # banda de veredicto inferior
    rrect(d, (16, H - 60, W - 16, H - 8), 12, vcolor)
    d.text((34, H - 46), verdict, font=F["badge"], fill=(255, 255, 255))
    return img, d


def field(d, y, label, value, focused=False):
    rrect(d, (40, y, W - 40, y + 50), 10, (247, 248, 250),
          outline=(BLUE if focused else (220, 224, 230)), width=2 if focused else 1)
    d.text((52, y + 8), label, font=F["tiny"], fill=SUB)
    d.text((52, y + 25), value, font=F["s"], fill=INK)


def button(d, y, label, color=BLUE, h=52, x0=40, x1=W - 40):
    rrect(d, (x0, y, x1, y + h), 12, color)
    tw = d.textlength(label, font=F["b"])
    d.text(((x0 + x1) / 2 - tw / 2, y + h / 2 - 11), label, font=F["b"], fill=(255, 255, 255))


def annot(d, y, text, color):
    d.text((40, y), text, font=F["s"], fill=color)


# 1. Login detectado --------------------------------------------------------
img, d = base("Iniciar sesión", "✓ CORRECTO · login detectado", GREEN)
d.text((40, 150), "Bienvenido", font=F["h"], fill=INK)
field(d, 210, "Email  (id: email_input)", "daniel@example.com")
field(d, 280, "Password  (id: password_input)", "••••••••••")
button(d, 360, "Iniciar sesión   (text)")
annot(d, 440, "🔐 detectLoginWall → la IA sabe que necesita login", BLUE)
annot(d, 470, "estado S0  ·  framework: Android nativo", SUB)
img.save(os.path.join(OUT, "01_login.png"))

# 2. Home tras login --------------------------------------------------------
img, d = base("Inicio", "✓ CORRECTO · login → home (S0→S1)", GREEN)
d.text((40, 160), "Inicio  (id: home_title)", font=F["h"], fill=INK)
d.text((40, 210), "Bienvenido, Daniel", font=F["b"], fill=SUB)
rrect(d, (40, 260, W - 40, 360), 12, (247, 248, 250), outline=(225, 228, 232))
d.text((56, 280), "welcome_message", font=F["tiny"], fill=SUB)
d.text((56, 305), "Has iniciado sesión correctamente", font=F["s"], fill=INK)
button(d, 760 - 380, "Cerrar sesión", color=(90, 96, 104))
annot(d, 470, "✓ expect(home_title).toBeVisible() pasó", GREEN)
img.save(os.path.join(OUT, "02_home.png"))

# 3. Diálogo de permisos ----------------------------------------------------
img, d = base("Mapa", "⚠ DUDOSO · permisos bloquean el flujo", AMBER)
# fondo atenuado
d.rectangle((18, 132, W - 18, H - 62), fill=(225, 227, 231))
# diálogo
rrect(d, (50, 320, W - 50, 560), 18, PHONE, outline=(210, 214, 220), width=2)
d.text((72, 350), "¿Permitir que la app", font=F["t"], fill=INK)
d.text((72, 378), "acceda a tu ubicación?", font=F["t"], fill=INK)
d.text((72, 420), "com.android.permissioncontroller", font=F["tiny"], fill=SUB)
button(d, 470, "Al usar la app", color=GREEN, x0=72, x1=W - 72, h=44)
button(d, 520, "Denegar", color=(150, 150, 156), x0=72, x1=W - 72, h=34)
annot(d, 600 + 175, "handle_system_dialog(accept=true) → continúa", BLUE)
img.save(os.path.join(OUT, "03_permission.png"))

# 4. Teclado tapando botón --------------------------------------------------
img, d = base("Registro", "⚠ DUDOSO · teclado tapa el botón", AMBER)
field(d, 170, "Email", "daniel@example.com")
field(d, 235, "Password", "••••••", focused=True)
# botón parcialmente tapado
button(d, 470, "Crear cuenta", color=(190, 200, 215))
# teclado
rrect(d, (16, 500, W - 16, H - 62), 0, (210, 214, 220))
for r in range(4):
    for c in range(10):
        x = 28 + c * 41
        y = 520 + r * 58
        rrect(d, (x, y, x + 34, y + 48), 6, (245, 246, 248), outline=(225, 228, 232))
annot(d, 470 - 26, "hideKeyboard() antes de tocar 'Crear cuenta'", BLUE)
img.save(os.path.join(OUT, "04_keyboard.png"))

# 5. ANR / crash ------------------------------------------------------------
img, d = base("App", "✗ INCORRECTO · ANR (app no responde)", RED)
d.rectangle((18, 132, W - 18, H - 62), fill=(225, 227, 231))
rrect(d, (50, 360, W - 50, 540), 18, PHONE, outline=(210, 214, 220), width=2)
d.text((72, 392), "La aplicación no responde", font=F["t"], fill=INK)
d.text((72, 430), "¿Quieres cerrarla?", font=F["b"], fill=SUB)
button(d, 480, "Cerrar", color=RED, x0=72, x1=W - 72, h=40)
annot(d, 600 + 160, "detectAnr → el snapshot avisa del bloqueo", RED)
img.save(os.path.join(OUT, "05_anr.png"))

# 6. Elemento fuera de pantalla (lista) -------------------------------------
img, d = base("Productos", "⚠ DUDOSO · ítem fuera de pantalla", AMBER)
for i in range(7):
    y = 150 + i * 95
    rrect(d, (40, y, W - 40, y + 82), 12, (247, 248, 250), outline=(228, 230, 234))
    d.text((56, y + 14), f"ProductCard #{i+1}", font=F["b"], fill=INK)
    d.text((56, y + 44), "id: product_" + str(i + 1), font=F["tiny"], fill=SUB)
# flecha de scroll
d.text((W - 78, H - 130), "↓ #42", font=F["t"], fill=BLUE)
annot(d, H - 96 - 8, "scrollIntoViewIfNeeded() hasta hallarlo o fin", BLUE)
img.save(os.path.join(OUT, "06_offscreen.png"))

# 7. WebView / app híbrida --------------------------------------------------
img, d = base("Ayuda (WebView)", "✓ CORRECTO · WebView detectado", GREEN)
rrect(d, (40, 150, W - 40, H - 90), 12, (252, 252, 253), outline=(220, 224, 230), width=2)
d.text((56, 168), "🌐 android.webkit.WebView", font=F["s"], fill=SUB)
d.text((56, 210), "Centro de ayuda", font=F["h"], fill=INK)
d.text((56, 260), "<h1>, <button>, <input> del DOM", font=F["s"], fill=INK)
rrect(d, (56, 300, W - 56, 350), 8, (247, 248, 250), outline=(225, 228, 232))
d.text((68, 314), "web component (shadow DOM)", font=F["tiny"], fill=SUB)
button(d, 380, "Enviar consulta", color=BLUE, x0=56, x1=W - 56, h=46)
annot(d, 470, "detectWebView → selectores por texto/a11y funcionan", BLUE)
annot(d, 500, "DOM profundo (CSS) vía CDP → Roadmap", SUB)
img.save(os.path.join(OUT, "07_webview.png"))

# 8. Grafo de flujos --------------------------------------------------------
img = Image.new("RGB", (W, 520), (255, 255, 255))
d = ImageDraw.Draw(img)
d.text((30, 24), "Grafo de flujos (get_flow_graph)", font=F["t"], fill=INK)


def state(cx, cy, label, color):
    rrect(d, (cx - 90, cy - 34, cx + 90, cy + 34), 16, (247, 250, 255), outline=color, width=3)
    tw = d.textlength(label, font=F["b"])
    d.text((cx - tw / 2, cy - 11), label, font=F["b"], fill=INK)


state(W // 2, 120, "S0 · Login", BLUE)
state(W // 2, 320, "S1 · Inicio", GREEN)
d.line((W // 2, 154, W // 2, 286), fill=(120, 126, 134), width=3)
d.polygon([(W // 2 - 7, 286), (W // 2 + 7, 286), (W // 2, 300)], fill=(120, 126, 134))
d.text((W // 2 + 14, 205), "login", font=F["s"], fill=BLUE)
d.text((30, 400), "Nodos = pantallas · Aristas = acciones.", font=F["s"], fill=SUB)
d.text((30, 426), "Permite recorrer TODOS los flujos sin bucles", font=F["s"], fill=SUB)
d.text((30, 452), "y ver qué pantallas faltan por explorar.", font=F["s"], fill=SUB)
img.save(os.path.join(OUT, "08_flowgraph.png"))

# 9. Rotación / orientación horizontal --------------------------------------
LW, LH = 900, 460
img = Image.new("RGB", (LW, LH), BG)
d = ImageDraw.Draw(img)
rrect(d, (16, 16, LW - 16, LH - 16), 30, PHONE, outline=(210, 214, 220), width=2)
rrect(d, (40, 40, LW - 40, 84), 0, (248, 249, 251))
d.text((58, 52), "Detalle (horizontal)", font=F["t"], fill=INK)
field(d, 120, "Campo A", "valor A")
d.text((LW - 420, 120), "↻ orientación: horizontal", font=F["s"], fill=AMBER)
d.text((LW - 420, 150), "info().screen se reconsulta (Android)", font=F["tiny"], fill=SUB)
button(d, 360, "Continuar", x0=40, x1=LW - 40, h=44)
rrect(d, (16, LH - 60, LW - 16, LH - 16), 12, AMBER)
d.text((34, LH - 46), "⚠ DUDOSO · rotación: tamaño dinámico OK; API de rotar → Roadmap",
       font=F["badge"], fill=(255, 255, 255))
img.save(os.path.join(OUT, "09_rotation.png"))

# 10. RTL (árabe/hebreo) -----------------------------------------------------
img, d = base("الإعدادات", "⚠ DUDOSO · RTL: layout espejado", AMBER)


def rfield(d, y, label, value):
    rrect(d, (40, y, W - 40, y + 50), 10, (247, 248, 250), outline=(220, 224, 230))
    lw = d.textlength(label, font=F["tiny"])
    d.text((W - 52 - lw, y + 8), label, font=F["tiny"], fill=SUB)
    vw = d.textlength(value, font=F["s"])
    d.text((W - 52 - vw, y + 25), value, font=F["s"], fill=INK)


d.text((W - 40 - d.textlength("مرحبا", font=F["h"]), 150), "مرحبا", font=F["h"], fill=INK)
rfield(d, 220, "البريد", "user@mail.com")
rfield(d, 290, "كلمة المرور", "••••••")
button(d, 370, "دخول")
annot(d, 450, "swipe 'forward/back' en vez de left/right → Roadmap", BLUE)
annot(d, 480, "normalizar marcas bidi (U+200F) en el match → Roadmap", SUB)
img.save(os.path.join(OUT, "10_rtl.png"))

# 11. Modal / bottom sheet ---------------------------------------------------
img, d = base("Carrito", "⚠ DUDOSO · modal/bottom sheet encima", AMBER)
# contenido de fondo
for i in range(3):
    y = 160 + i * 90
    rrect(d, (40, y, W - 40, y + 74), 12, (247, 248, 250), outline=(228, 230, 234))
    d.text((56, y + 24), f"Artículo {i+1}", font=F["b"], fill=(170, 174, 180))
# scrim
ov = Image.new("RGBA", (W, H), (0, 0, 0, 90))
img.paste(Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB"), (0, 0))
d = ImageDraw.Draw(img)
# bottom sheet
rrect(d, (16, 520, W - 16, H - 62), 22, PHONE, outline=(210, 214, 220), width=2)
rrect(d, (W // 2 - 30, 538, W // 2 + 30, 544), 3, (210, 214, 220))
d.text((40, 566), "Confirmar pedido", font=F["t"], fill=INK)
d.text((40, 606), "Total: 49,90 €", font=F["b"], fill=SUB)
button(d, 660, "Pagar ahora", color=BLUE, x0=40, x1=W - 40, h=48)
d.text((40, 740), "Búsqueda acotada a la capa superior → Roadmap", font=F["s"], fill=BLUE)
img.save(os.path.join(OUT, "11_modal.png"))

print("Generadas", len(os.listdir(OUT)), "imágenes en", os.path.abspath(OUT))
