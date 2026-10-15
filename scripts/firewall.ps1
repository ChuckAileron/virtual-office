# Abre en el firewall de Windows los puertos necesarios para usar la oficina
# virtual desde otros equipos de la red local.
#
# Uso (se auto-eleva si hace falta):
#   powershell -ExecutionPolicy Bypass -File scripts/firewall.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/firewall.ps1 -Dev     # añade 5173 (npm run dev:lan)
#   powershell -ExecutionPolicy Bypass -File scripts/firewall.ps1 -Remove  # quita las reglas
param(
  [switch]$Remove,
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Se necesitan permisos de administrador. Reabriendo con elevacion...'
  $argList = @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', "`"$PSCommandPath`"")
  if ($Remove) { $argList += '-Remove' }
  if ($Dev) { $argList += '-Dev' }
  Start-Process powershell -Verb RunAs -ArgumentList $argList
  exit
}

$rules = @(
  @{ Name = 'VirtualOffice HTTP';      Protocol = 'TCP';    Ports = '80' },
  @{ Name = 'VirtualOffice HTTPS';     Protocol = 'TCP';    Ports = '443' },
  @{ Name = 'VirtualOffice WebRTC';    Protocol = 'UDP';    Ports = '20000-20100' },
  @{ Name = 'VirtualOffice Ping';      Protocol = 'ICMPv4'; Ports = $null }
)
if ($Dev) {
  $rules += @{ Name = 'VirtualOffice Dev HTTPS'; Protocol = 'TCP'; Ports = '5173' }
}

if ($Remove) {
  foreach ($rule in $rules) {
    if (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue) {
      Remove-NetFirewallRule -DisplayName $rule.Name
      Write-Host "Eliminada: $($rule.Name)"
    }
  }
  Write-Host 'Reglas eliminadas.'
  exit 0
}

foreach ($rule in $rules) {
  if (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $rule.Name
  }
  if ($rule.Protocol -eq 'ICMPv4') {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol ICMPv4 -IcmpType 8 | Out-Null
  } else {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol $rule.Protocol -LocalPort $rule.Ports | Out-Null
  }
  Write-Host "Regla creada: $($rule.Name)  ($($rule.Protocol) $($rule.Ports))"
}

Write-Host ''
Write-Host 'Listo: los demas equipos de la red local ya pueden conectarse.'
