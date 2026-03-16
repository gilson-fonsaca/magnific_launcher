#!/usr/bin/env bash
# uninstall.sh — Remove a extensão Magnific Launcher
set -euo pipefail

UUID="magnific-launcher@gilsonf"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "==> Desinstalando Magnific Launcher..."

# Desabilita antes de remover para evitar referências pendentes no shell
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions disable "${UUID}" 2>/dev/null && \
        echo "    Extensão desabilitada." || true
fi

# Remove o diretório da extensão
if [[ -d "${DEST}" ]]; then
    rm -rf "${DEST}"
    echo "    Arquivos removidos de: ${DEST}"
else
    echo "    Diretório não encontrado: ${DEST}"
    echo "    A extensão pode já ter sido removida."
fi

echo ""
echo "==> Desinstalação concluída!"
echo ""
echo "    Para aplicar completamente, reinicie a sessão GNOME:"
echo ""
echo "    • Wayland: faça logout e login novamente."
echo "    • X11: pressione Alt+F2, digite 'r' e tecle Enter."
