#!/bin/bash
# WebDJ: activa el entorno de Python, baja la última versión y arranca el servidor.
# Uso (en la carpeta dj):  ./iniciar.sh
cd "$(dirname "$0")" || exit 1
if [ ! -f .venv/bin/activate ]; then
    echo "No encuentro .venv (el entorno de Python). Créalo una vez con:"
    echo "  python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi
source .venv/bin/activate
echo "Buscando actualizaciones..."
git pull --ff-only || echo "(No pude actualizar: sigo con la versión que tienes)"
exec python server.py "$@"
