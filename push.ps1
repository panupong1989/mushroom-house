# push.ps1 - รันบน PowerShell พอเปิดคอม (gh ต้อง login อยู่)
$repo = "mushroom-house"
git add -A
git commit -m "sync from scaffold" 2>$null
$remote = git remote 2>$null
if (-not $remote) {
  git remote add origin "https://github.com/panupong1989/$repo.git"
}
git branch -M main
git push -u origin main
Write-Host "pushed to $repo"
