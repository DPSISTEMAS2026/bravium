# Script para hacer commit y push de los cambios del sistema de conciliación

Write-Host "`n🔧 CONFIGURACIÓN Y DEPLOYMENT" -ForegroundColor Cyan
Write-Host "=" * 70

# Verificar si Git está configurado
$gitUser = git config user.name 2>$null
$gitEmail = git config user.email 2>$null

if (-not $gitUser -or -not $gitEmail) {
    Write-Host "`n⚠️  Git no está configurado. Por favor configura tu identidad:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   git config --global user.name `"Tu Nombre`"" -ForegroundColor White
    Write-Host "   git config --global user.email `"tu@email.com`"" -ForegroundColor White
    Write-Host ""
    Write-Host "O solo para este repositorio (sin --global):" -ForegroundColor Gray
    Write-Host "   git config user.name `"Tu Nombre`"" -ForegroundColor White
    Write-Host "   git config user.email `"tu@email.com`"" -ForegroundColor White
    Write-Host ""
    Write-Host "Después ejecuta este script nuevamente." -ForegroundColor Yellow
    Write-Host "=" * 70
    exit 1
}

Write-Host "`n✅ Git configurado:" -ForegroundColor Green
Write-Host "   Usuario: $gitUser" -ForegroundColor White
Write-Host "   Email: $gitEmail" -ForegroundColor White

# Mostrar estado
Write-Host "`n📊 CAMBIOS A COMMITEAR:" -ForegroundColor Cyan
git status --short

Write-Host "`n📝 MENSAJE DEL COMMIT:" -ForegroundColor Cyan
$commitMessage = @"
feat: Sistema completo de conciliación con LibreDTE

- Integración LibreDTE API con formato correcto (_contribuyente_rut)
- Dashboard de conciliación con estadísticas en tiempo real
- Scripts de extracción y análisis de DTEs
- Datos de Enero 2026 extraídos (176 DTEs, $141.9M)
- Documentación completa del sistema
- Reorganización de archivos (scripts/, workflows/, data/)
- Motor de matching automático mejorado

Endpoints nuevos:
- GET /conciliacion/dashboard - Dashboard completo
- POST /ingestion/libredte/sync - Sincronizar DTEs

Ver SISTEMA_CONCILIACION.md para arquitectura completa
"@

Write-Host $commitMessage -ForegroundColor Gray

# Confirmar
Write-Host "`n" -NoNewline
$confirm = Read-Host "¿Deseas hacer commit y push? (s/n)"

if ($confirm -ne 's' -and $confirm -ne 'S') {
    Write-Host "`n❌ Cancelado" -ForegroundColor Red
    exit 0
}

# Commit
Write-Host "`n📦 Haciendo commit..." -ForegroundColor Yellow
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al hacer commit" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Commit exitoso" -ForegroundColor Green

# Push
Write-Host "`n🚀 Haciendo push a origin/master..." -ForegroundColor Yellow
git push origin master

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al hacer push" -ForegroundColor Red
    Write-Host "   Intenta manualmente: git push origin master" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✅ Push exitoso!" -ForegroundColor Green
Write-Host "`n🎉 DEPLOYMENT COMPLETADO" -ForegroundColor Green
Write-Host "=" * 70
Write-Host "`nRender detectará los cambios y desplegará automáticamente." -ForegroundColor Cyan
Write-Host "Puedes ver el progreso en: https://dashboard.render.com" -ForegroundColor Cyan
Write-Host "`nEspera ~5-10 minutos para que el deployment termine." -ForegroundColor Yellow
Write-Host "=" * 70
