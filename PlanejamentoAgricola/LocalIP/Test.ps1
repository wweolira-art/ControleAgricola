$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    & $compiler /nologo /target:exe /main:Tests /out:dist\LocalIP.Tests.exe /reference:System.ServiceProcess.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll src\Core.cs src\App.cs tests\Tests.cs
    if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao dos testes.' }
    & .\dist\LocalIP.Tests.exe
    if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes.' }
} finally { Pop-Location }
