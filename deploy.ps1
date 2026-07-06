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

Write-Host "Aplicando no servidor (PM2)..." -ForegroundColor Cyan
ssh $server "cd /opt && unzip -o sdr-platform-deploy.zip -d sdr-platform && cd $remote/backend && npm install --omit=dev && pm2 restart backend && cd $remote/frontend && npm install && npm run build"

Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Deploy concluido!" -ForegroundColor Green
