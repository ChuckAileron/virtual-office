# Configura oficina.lan y confia en la CA Caddy en este Windows.
param(
  [string]$Name = 'oficina.lan',
  [string]$Ip,
  [switch]$Remove,
  [switch]$SkipCa
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Se necesitan permisos de administrador. Reabriendo con elevacion...'
  $argList = @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', "`"$PSCommandPath`"", '-Name', $Name)
  if ($Ip) { $argList += @('-Ip', $Ip) }
  if ($Remove) { $argList += '-Remove' }
  if ($SkipCa) { $argList += '-SkipCa' }
  Start-Process powershell -Verb RunAs -ArgumentList $argList
  exit
}

# Ruta del archivo hosts real de Windows (sin extension; no es hosts.txt).
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'

# En clientes externos indica -Ip explícitamente. Sólo usa .env como conveniencia del servidor.
if (-not $Ip -and -not $Remove) {
  $envPath = Join-Path $PSScriptRoot '..\.env'
  if (Test-Path -LiteralPath $envPath) {
    $match = Select-String -LiteralPath $envPath -Pattern '^LAN_IP=(.+)$' | Select-Object -First 1
    if ($match) { $Ip = $match.Matches[0].Groups[1].Value.Trim() }
  }
}
if (-not $Ip -and -not $Remove) {
  throw 'Indica la IP LAN del servidor con -Ip 192.168.1.50 (en un cliente externo es obligatorio).'
}
if (-not $Remove -and $Ip -notmatch '^(\d{1,3}\.){3}\d{1,3}$') {
  throw "IP IPv4 invalida: '$Ip'. Ejemplo: -Ip 192.168.1.7"
}

# Quita cualquier linea previa con ese nombre (para no duplicar ni dejar IP vieja).
$kept = Get-Content -LiteralPath $hosts | Where-Object { $_ -notmatch "^\s*\S+\s+$([regex]::Escape($Name))(\s|$)" }

if ($Remove) {
  Set-Content -LiteralPath $hosts -Value $kept -Encoding ascii
  Write-Host "Eliminada la entrada '$Name' de $hosts"
  ipconfig /flushdns | Out-Null
  exit 0
}

Set-Content -LiteralPath $hosts -Value ($kept + "$Ip`t$Name") -Encoding ascii
Write-Host "Anadida en el archivo hosts (sin extension): $Ip`t$Name   ($hosts)"
ipconfig /flushdns | Out-Null
if (-not $SkipCa) {
  $caPath = Join-Path $env:TEMP 'oficina-virtual-ca.crt'
  $previousCallback = [Net.ServicePointManager]::ServerCertificateValidationCallback
  $previousProtocol = [Net.ServicePointManager]::SecurityProtocol
  try {
    # Se omite la validacion solo durante esta descarga inicial de la CA.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    Invoke-WebRequest -Uri "https://$Name/ca.crt" -OutFile $caPath -UseBasicParsing
  } finally {
    [Net.ServicePointManager]::ServerCertificateValidationCallback = $previousCallback
    [Net.ServicePointManager]::SecurityProtocol = $previousProtocol
  }
  Import-Certificate -FilePath $caPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
  Remove-Item -LiteralPath $caPath -Force
  Write-Host 'CA de Caddy instalada en Entidades de certificacion raiz de confianza (equipo local).'
}
Write-Host "Listo: abre https://$Name/"
