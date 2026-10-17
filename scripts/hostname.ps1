# Registra el nombre local de la oficina virtual (oficina.lan por defecto) en el
# archivo hosts de Windows, apuntando a la IP de LAN del servidor. Asi el equipo
# servidor puede abrir https://oficina.lan/ en lugar de https://<IP>/.
#
# Los demas equipos deben hacer lo mismo en su propio archivo hosts (o registrar
# el nombre en el DNS del router) e instalar la CA de Caddy.
#
# Uso (se auto-eleva si hace falta):
#   powershell -ExecutionPolicy Bypass -File scripts/hostname.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/hostname.ps1 -Name oficina.lan
#   powershell -ExecutionPolicy Bypass -File scripts/hostname.ps1 -Remove
param(
  [string]$Name = 'oficina.lan',
  [string]$Ip,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Se necesitan permisos de administrador. Reabriendo con elevacion...'
  $argList = @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', "`"$PSCommandPath`"", '-Name', $Name)
  if ($Ip) { $argList += @('-Ip', $Ip) }
  if ($Remove) { $argList += '-Remove' }
  Start-Process powershell -Verb RunAs -ArgumentList $argList
  exit
}

$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"

# IP: la indicada, o la de .env (LAN_IP), o la detectada por setup-env.
if (-not $Ip) {
  $envPath = Join-Path $PSScriptRoot '..\.env'
  if (Test-Path -LiteralPath $envPath) {
    $match = Select-String -LiteralPath $envPath -Pattern '^LAN_IP=(.+)$' | Select-Object -First 1
    if ($match) { $Ip = $match.Matches[0].Groups[1].Value.Trim() }
  }
}
if (-not $Ip) {
  $Ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1).IPAddress
}
if (-not $Ip) {
  throw 'No se pudo determinar la IP de LAN. Usa: -Ip 192.168.1.50'
}

# Quita cualquier linea previa con ese nombre (para no duplicar ni dejar IP vieja).
$kept = Get-Content -LiteralPath $hosts | Where-Object { $_ -notmatch "^\s*\S+\s+$([regex]::Escape($Name))\s*$" }

if ($Remove) {
  Set-Content -LiteralPath $hosts -Value $kept
  Write-Host "Eliminada la entrada '$Name' de $hosts"
  ipconfig /flushdns | Out-Null
  exit 0
}

Set-Content -LiteralPath $hosts -Value ($kept + "$Ip`t$Name")
Write-Host "Anadida: $Ip`t$Name   ($hosts)"
ipconfig /flushdns | Out-Null
Write-Host ''
Write-Host "Listo: abre https://$Name/ (instala la CA de Caddy si el navegador avisa)."
