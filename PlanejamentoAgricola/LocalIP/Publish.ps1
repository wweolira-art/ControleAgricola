param([switch]$Once)

$ErrorActionPreference = "Stop"
$configPath = Join-Path $PSScriptRoot "config.json"
$script:config = [pscustomobject]@{
    apiUrl = "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/localip/"
    porta = 5173
    interfaceIndex = 0
    intervaloSegundos = 3600
}
if (Test-Path -LiteralPath $configPath) {
    $saved = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    foreach ($key in @("apiUrl", "porta", "interfaceIndex", "intervaloSegundos")) {
        if ($null -ne $saved.$key) { $script:config.$key = $saved.$key }
    }
}
$envPort = [int]($env:PLANEJAMENTO_APP_PORT)
if ($envPort -gt 0) { $script:config.porta = $envPort }

function Get-NetworkAddresses {
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue)
    $interfaces = @(Get-NetIPInterface -AddressFamily IPv4 -ErrorAction SilentlyContinue)
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" -and $_.AddressState -eq "Preferred"
    })
    @($addresses | ForEach-Object {
        $address = $_
        $route = $routes | Where-Object InterfaceIndex -eq $address.InterfaceIndex | Sort-Object RouteMetric | Select-Object -First 1
        $iface = $interfaces | Where-Object InterfaceIndex -eq $address.InterfaceIndex | Select-Object -First 1
        if ($iface.ConnectionState -eq "Connected") {
            [pscustomobject]@{
                IPAddress = $address.IPAddress
                InterfaceIndex = $address.InterfaceIndex
                Label = "$($address.InterfaceAlias) - $($address.IPAddress)"
                Rank = $(if ($route) { [int]$route.RouteMetric + [int]$iface.InterfaceMetric } else { 100000 })
            }
        }
    } | Sort-Object Rank, InterfaceIndex, IPAddress)
}

function Invoke-LocalIpJsonRequest {
    param([string]$Method, [string]$RequestUri, [string]$BodyJson)
    $bytes = [Text.Encoding]::UTF8.GetBytes($BodyJson)
    Invoke-WebRequest -UseBasicParsing -Uri $RequestUri -Method $Method `
        -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 20
}

function Get-LocalIpUpdateUri {
    param($Item, [string]$BaseUri)
    if (-not $Item) { return "" }
    $selfLink = @($Item.links | Where-Object { $_.rel -eq "self" }) | Select-Object -First 1
    if ($selfLink -and $selfLink.href) { return [string]$selfLink.href }
    foreach ($property in "id", "rowid") {
        if ($Item.PSObject.Properties.Match($property).Count -gt 0 -and $null -ne $Item.$property -and [string]$Item.$property) {
            return "$BaseUri$([uri]::EscapeDataString([string]$Item.$property))"
        }
    }
    return ""
}

function Get-LocalIpRows {
    param([string]$BaseUri)
    $rows = New-Object System.Collections.Generic.List[object]
    $pageUri = $BaseUri
    $seen = New-Object System.Collections.Generic.HashSet[string]
    while ($pageUri) {
        if (-not $seen.Add($pageUri) -or $seen.Count -gt 1000) { throw "Paginacao invalida na API." }
        $lookup = Invoke-RestMethod -Uri $pageUri -Method Get -TimeoutSec 20
        foreach ($item in @($lookup.items)) { if ($item) { $rows.Add($item) } }
        $next = @($lookup.links | Where-Object { $_.rel -eq "next" }) | Select-Object -First 1
        if ((-not $next -or -not $next.href) -and $lookup.hasMore) { throw "API indicou mais registros sem link de paginacao." }
        $pageUri = if ($next -and $next.href) { [string]$next.href } else { "" }
    }
    return @($rows)
}

function Publish-LocalIp {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $selected = @(Get-NetworkAddresses)
    if ($script:config.interfaceIndex -gt 0) {
        $match = @($selected | Where-Object InterfaceIndex -eq $script:config.interfaceIndex) | Select-Object -First 1
        if ($match) { $selected = @($match) }
    }
    $chosen = $selected | Select-Object -First 1
    if (-not $chosen) { throw "Nenhum IPv4 de rede conectado encontrado." }

    $data = @{
        servidor = [string]$env:COMPUTERNAME
        numeroip = [string]$chosen.IPAddress
        porta = [int]$script:config.porta
    }
    $baseUri = ($script:config.apiUrl.TrimEnd("/") + "/")
    $normalized = $data.servidor.Trim().ToUpperInvariant()
    $rows = @(Get-LocalIpRows -BaseUri $baseUri)
    $matches = @($rows | Where-Object { $_.servidor -and ($_.servidor.ToString().Trim().ToUpperInvariant() -eq $normalized) })
    $othersActive = @($rows | Where-Object {
        $_.servidor -and ($_.servidor.ToString().Trim().ToUpperInvariant() -ne $normalized) -and
        $_.ativo -and ($_.ativo.ToString().Trim().ToUpperInvariant() -eq "S")
    })
    if ($matches.Count -eq 0) {
        $payload = @{ servidor = $data.servidor; numeroip = $data.numeroip; porta = $data.porta; ativo = "S" }
        $body = $payload | ConvertTo-Json -Compress
        $response = Invoke-LocalIpJsonRequest -Method Post -RequestUri $baseUri -BodyJson $body
        $action = "Inserido"
    } else {
        foreach ($row in $matches) {
            $updateUri = Get-LocalIpUpdateUri -Item $row -BaseUri $baseUri
            if (-not $updateUri) { throw "Registro encontrado sem link para atualizar. Nenhuma linha inserida." }
            $payload = @{ servidor = [string]$row.servidor; numeroip = $data.numeroip; porta = $data.porta; ativo = "S" }
            $body = $payload | ConvertTo-Json -Compress
            $response = Invoke-LocalIpJsonRequest -Method Put -RequestUri $updateUri -BodyJson $body
        }
        $action = "Atualizado"
    }
    foreach ($row in $othersActive) {
        $updateUri = Get-LocalIpUpdateUri -Item $row -BaseUri $baseUri
        if (-not $updateUri) { throw "Outro servidor ativo esta sem link para inativar." }
        $porta = 0
        [void][int]::TryParse([string]$row.porta, [ref]$porta)
        $body = (@{ servidor = [string]$row.servidor; numeroip = [string]$row.numeroip; porta = $porta; ativo = "N" } | ConvertTo-Json -Compress)
        $response = Invoke-LocalIpJsonRequest -Method Put -RequestUri $updateUri -BodyJson $body
    }
    Write-Output "$(Get-Date -Format 'HH:mm:ss') $action $($chosen.IPAddress):$($script:config.porta) (HTTP $($response.StatusCode))"
}

$interval = [Math]::Max(10, [int]$script:config.intervaloSegundos)
Write-Output "LocalIP publicando a porta $($script:config.porta) a cada ${interval}s."
while ($true) {
    try {
        Publish-LocalIp
    } catch {
        Write-Output "$(Get-Date -Format 'HH:mm:ss') Falha: $($_.Exception.Message)"
    }
    if ($Once) { break }
    Start-Sleep -Seconds $interval
}
