#!/usr/bin/env bash
#
# push.sh — sube Mobiwright a GitHub como repositorio PRIVADO (para probarlo
# primero). En un solo comando.
#
# Uso:  bash push.sh                 # crea/usa dan085/Mobiwright (privado)
#       bash push.sh <owner/repo>    # otro nombre de repo
#
# Recomendado: tener GitHub CLI (`gh`) autenticado → `gh auth login`.
# Así el repo se crea PRIVADO automáticamente. Si no, usa git + un repo
# privado ya creado a mano en GitHub.
set -euo pipefail

SLUG="${1:-dan085/Mobiwright}"
REMOTE="https://github.com/${SLUG}.git"

log() { printf "\033[1;35m[push]\033[0m %s\n" "$*"; }

command -v git >/dev/null || { echo "git no está instalado."; exit 1; }

# Commit local
if [ ! -d .git ]; then log "Inicializando repositorio..."; git init -b main; fi
git config user.email >/dev/null 2>&1 || git config user.email "dverdugo85@gmail.com"
git config user.name  >/dev/null 2>&1 || git config user.name  "dan085"
log "Añadiendo y commiteando..."
git add .
git commit -m "feat: Mobiwright 0.1.0 — E2E móvil estilo Playwright + MCP + reporte de flujo" \
  || log "(nada nuevo que commitear)"

# Opción A: GitHub CLI → crea el repo PRIVADO y hace push
if command -v gh >/dev/null 2>&1; then
  log "Creando repo PRIVADO con GitHub CLI y haciendo push..."
  if gh repo view "$SLUG" >/dev/null 2>&1; then
    log "El repo ya existe; lo marco como privado y hago push."
    gh repo edit "$SLUG" --visibility private --accept-visibility-change-consequences || true
    git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$REMOTE" || git remote add origin "$REMOTE"
    git push -u origin main
  else
    gh repo create "$SLUG" --private --source=. --remote=origin --push
  fi
  log "Listo (privado): https://github.com/${SLUG}"
  exit 0
fi

# Opción B: sin gh → el repo PRIVADO debe existir ya en GitHub
log "GitHub CLI no encontrado."
log "1) Crea el repo PRIVADO en https://github.com/new (Owner: dan085, Name: Mobiwright, Private)."
log "2) Vuelve a ejecutar, o haz manualmente:"
git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$REMOTE" || git remote add origin "$REMOTE"
log "Haciendo push a $REMOTE ..."
if ! git push -u origin main; then
  log "Push falló (¿repo no creado aún o autenticación?)."
  log "  - Crea el repo privado primero, o instala gh: https://cli.github.com  → gh auth login"
  log "  - Si ya tiene commits:  git pull --rebase origin main && git push -u origin main"
  exit 1
fi
log "Listo: https://github.com/${SLUG}  (verifica que esté en Private)"
