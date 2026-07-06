$server = "root@167.233.84.42"
$remote = "/opt/sdr-platform"
$staging = "..\sdr-platform-deploy-staging"

Write-Host "Preparando arquivos (sem node_modules/.env)..." -ForegroundColor Cyan
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $staging | Out-Null
robocopy backend "$staging\backend" /E /XD node_modules /XF .env .env.local | Out-Null
robocopy frontend "$staging\frontend" /E /XD node_modules dist /XF .env .env.local | Out-Null

Write-Host "Compactando projeto..." -ForegroundColor Cyan
Compress-Archive -Path "$staging\backend","$staging\frontend" -DestinationPath "..\sdr-platform-deploy.zip" -Force

Write-Host "Enviando para o servidor..." -ForegroundColor Cyan
scp "..\sdr-platform-deploy.zip" "${server}:/opt/"
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: falha ao enviar o pacote (scp)." -ForegroundColor Red; exit 1 }

Write-Host "Extraindo e atualizando backend (PM2)..." -ForegroundColor Cyan
# unzip retorna exit code 1 so por causa do aviso inofensivo de separador de caminho
# (zip gerado no Windows usa backslash) - o "|| true" evita que isso mate a cadeia && seguinte.
ssh $server "cd /opt && (unzip -o sdr-platform-deploy.zip -d sdr-platform || true) && cd $remote/backend && npm install --omit=dev && pm2 startOrRestart ecosystem.config.cjs"
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: falha ao extrair/instalar/reiniciar o backend. Deploy incompleto." -ForegroundColor Red; exit 1 }

# separado do passo acima: builds do vite geram muita saída e, quando combinados num único
# comando ssh, já mostraram travar antes de completar sem sinalizar erro (ver histórico do chat).
Write-Host "Rebuild do frontend..." -ForegroundColor Cyan
ssh $server "cd $remote/frontend && npm install && npm run build"
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO: falha ao instalar/buildar o frontend. Backend foi atualizado, mas o frontend NAO." -ForegroundColor Red; exit 1 }

Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Deploy concluido!" -ForegroundColor Green
