@echo off
echo Starting Organica on http://localhost:8080
where npx >nul 2>nul
if %errorlevel%==0 (
    npx serve . -p 8080
) else (
    echo npx not found, falling back to Python http.server...
    python -m http.server 8080
)
