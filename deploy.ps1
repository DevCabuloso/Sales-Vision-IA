$server = "root@167.233.84.42"
$remote = "/opt/sdr-platform"

Write-Host "Compactando projeto..." -ForegroundColor Cyan
Compress-Archive -Path "backend","frontend","docker-compose.yml" -DestinationPath "..\sdr-platform-deploy.zip" -Force

Write-Host "Enviando para o servidor..." -ForegroundColor Cyan
scp "..\sdr-platform-deploy.zip" "${server}:/opt/"

Write-Host "Aplicando no servidor..." -ForegroundColor Cyan
ssh $server "cd /opt && unzip -o sdr-platform-deploy.zip -d sdr-platform && cd sdr-platform && docker compose up -d --build"

Write-Host "Deploy concluido!" -ForegroundColor Green
