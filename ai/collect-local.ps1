# Собирает локальные (не публикуемые) материалы ИИ в одну папку: веса нейросети, прогоны обучения, записи боёв, отчёты.
# Только копирует, ничего не удаляет и не меняет. Окружение Python (.venv-rl, ≈4,4 ГБ) по умолчанию не копируется: его создаёт инструкция из ml/README.md.
#   powershell -File ai\collect-local.ps1 -From C:\tt-rl -To D:\Tropa-AI [-WithCheckpoints]
param(
  [Parameter(Mandatory = $true)][string]$From,
  [Parameter(Mandatory = $true)][string]$To,
  [switch]$WithCheckpoints  # добавить чекпоинты обучения (*.pt, нужны для --resume)
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $From)) { throw "Нет папки: $From" }
New-Item -ItemType Directory -Force -Path $To | Out-Null

function Copy-If($src, $dst) { if (Test-Path $src) { New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null; Copy-Item $src $dst -Recurse -Force; "ок: $src" } else { "нет: $src" } }

Copy-If (Join-Path $From 'public\agents')            (Join-Path $To 'weights')
Copy-If (Join-Path $From 'ml\rl\runs\README.md')      (Join-Path $To 'reports\README-RL.md')
Copy-If (Join-Path $From 'ai\README.md')              (Join-Path $To 'README.md')
Copy-If (Join-Path $From 'ai\AGENT_PROMPT.md')        (Join-Path $To 'AGENT_PROMPT.md')
Copy-If (Join-Path $From 'ml\reports')                (Join-Path $To 'reports\optuna')

$runs = Join-Path $From 'ml\rl\runs'
if (Test-Path $runs) {
  foreach ($d in Get-ChildItem $runs -Directory) {
    $dst = Join-Path $To ('runs\' + $d.Name)
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    foreach ($f in Get-ChildItem $d.FullName -File) { Copy-Item $f.FullName $dst -Force }          # config, summary, metrics, оценки
    if (Test-Path (Join-Path $d.FullName 'demos')) { Copy-Item (Join-Path $d.FullName 'demos') $dst -Recurse -Force }  # записи боёв .ttrec
    if ($WithCheckpoints -and (Test-Path (Join-Path $d.FullName 'ckpt'))) { Copy-Item (Join-Path $d.FullName 'ckpt') $dst -Recurse -Force }
  }
  Get-ChildItem $runs -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $To 'runs') -Force }  # логи и baseline-*.json на верхнем уровне
  "ок: прогоны"
}
"Готово: $To"
