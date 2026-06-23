$server = "root@167.233.84.42"
$localBase = "C:\Users\karlo\OneDrive\Desktop\sdr-platform"
$remoteBase = "/opt/sdr-platform"
$lastCheck = Get-Date

Write-Host "Monitorando alteracoes em $localBase" -ForegroundColor Green
Write-Host "Pressione Ctrl+C para parar." -ForegroundColor Yellow

while ($true) {
    Start-Sleep -Seconds 1

    $changed = Get-ChildItem -Recurse -Path $localBase -File |
        Where-Object {
            $_.LastWriteTime -gt $lastCheck -and
            $_.FullName -notmatch "node_modules|\\\.git\\|\\dist\\|\.zip|watch\.ps1|deploy\.ps1"
        }

    foreach ($file in $changed) {
        $relative = $file.FullName.Substring($localBase.Length).Replace("\", "/")
        Write-Host "Sincronizando: $relative" -ForegroundColor Cyan
        scp $file.FullName "${server}:${remoteBase}${relative}"
    }

    $lastCheck = Get-Date
}
