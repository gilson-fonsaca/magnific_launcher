#!/usr/bin/env bash
# install.sh — Instala a extensão Magnific Launcher localmente
set -euo pipefail

UUID="magnific-launcher@gilsonf"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Instalando Magnific Launcher..."

# Garante que o diretório de destino existe
mkdir -p "${DEST}/schemas"

# Copia os arquivos da extensão
cp "${SCRIPT_DIR}/metadata.json" "${DEST}/metadata.json"
cp "${SCRIPT_DIR}/extension.js"  "${DEST}/extension.js"
cp "${SCRIPT_DIR}/prefs.js"      "${DEST}/prefs.js"
cp "${SCRIPT_DIR}/schemas/"*.xml "${DEST}/schemas/"

echo "    Arquivos copiados para: ${DEST}"

# Compila o schema GSettings dentro do diretório da extensão
if command -v glib-compile-schemas &>/dev/null; then
    glib-compile-schemas "${DEST}/schemas/"
    echo "    Schema GSettings compilado."
else
    echo "    AVISO: glib-compile-schemas não encontrado."
    echo "    Instale com: sudo apt install libglib2.0-bin"
    echo "    Depois execute: glib-compile-schemas ${DEST}/schemas/"
fi

# Habilita a extensão
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions enable "${UUID}" 2>/dev/null && \
        echo "    Extensão habilitada via gnome-extensions." || \
        echo "    Não foi possível habilitar automaticamente (veja abaixo)."
else
    echo "    Comando gnome-extensions não encontrado."
fi

echo ""
echo "==> Instalação concluída!"
echo ""
echo "    Para abrir as configurações da extensão:"
echo "      gnome-extensions prefs ${UUID}"
echo ""
echo "    Se a extensão não aparecer ativa, reinicie a sessão GNOME:"
echo ""
echo "    • Wayland: faça logout e login novamente, ou execute:"
echo "      dbus-run-session -- gnome-shell --nested --wayland"
echo ""
echo "    • X11: pressione Alt+F2, digite 'r' e tecle Enter."
echo ""
echo "    Depois habilite manualmente se necessário:"
echo "      gnome-extensions enable ${UUID}"
