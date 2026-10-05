$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $compiler)) { throw 'Compilador .NET Framework nao encontrado.' }
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force dist | Out-Null
    & $compiler /nologo /target:winexe /platform:anycpu /optimize+ /win32manifest:src\app.manifest /out:dist\LocalIP-Setup.exe /reference:System.ServiceProcess.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll src\Core.cs src\App.cs src\Version.cs
    if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao.' }
    Write-Output 'Instalavel gerado em dist\LocalIP-Setup.exe. Nenhum servico instalado.'
} finally { Pop-Location }
