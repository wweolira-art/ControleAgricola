param([switch]$Check)

$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'config.json'
$script:config = [pscustomobject]@{
    apiUrl = 'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/localip/'
    porta = 8080
    interfaceIndex = 0
    intervaloSegundos = 3600
}
if (Test-Path -LiteralPath $configPath) {
    $saved = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    foreach ($key in @('apiUrl', 'porta', 'interfaceIndex', 'intervaloSegundos')) {
        if ($null -ne $saved.$key) { $script:config.$key = $saved.$key }
    }
}

function Get-NetworkAddresses {
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
    $interfaces = @(Get-NetIPInterface -AddressFamily IPv4 -ErrorAction SilentlyContinue)
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred'
    })
    @($addresses | ForEach-Object {
        $address = $_
        $route = $routes | Where-Object InterfaceIndex -eq $address.InterfaceIndex | Sort-Object RouteMetric | Select-Object -First 1
        $iface = $interfaces | Where-Object InterfaceIndex -eq $address.InterfaceIndex | Select-Object -First 1
        if ($iface.ConnectionState -eq 'Connected') {
            [pscustomobject]@{
                IPAddress = $address.IPAddress
                InterfaceIndex = $address.InterfaceIndex
                Label = "$($address.InterfaceAlias) - $($address.IPAddress)"
                Rank = $(if ($route) { [int]$route.RouteMetric + [int]$iface.InterfaceMetric } else { 100000 })
            }
        }
    } | Sort-Object Rank, InterfaceIndex, IPAddress)
}

if ($Check) {
    Get-NetworkAddresses | Format-Table IPAddress, InterfaceIndex, Label
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:lastSent = ''
$script:busy = $false
$script:worker = $null
$script:job = $null
$script:pendingPayload = ''

$form = New-Object System.Windows.Forms.Form
$form.Text = 'LocalIP - Publicar endereco da rede'
$form.ClientSize = New-Object System.Drawing.Size(640, 370)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

function Add-Label($text, $x, $y, $width = 600) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $text
    $label.Location = New-Object System.Drawing.Point($x, $y)
    $label.Size = New-Object System.Drawing.Size($width, 26)
    $form.Controls.Add($label)
    return $label
}
function Add-Button($text, $x, $y, $width) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $text
    $button.Location = New-Object System.Drawing.Point($x, $y)
    $button.Size = New-Object System.Drawing.Size($width, 36)
    $form.Controls.Add($button)
    return $button
}
$null = Add-Label "Servidor: $env:COMPUTERNAME" 20 20
$null = Add-Label 'IPv4 / adaptador de rede' 20 58
$adapter = New-Object System.Windows.Forms.ComboBox
$adapter.Location = New-Object System.Drawing.Point(20, 86)
$adapter.Size = New-Object System.Drawing.Size(600, 30)
$adapter.DropDownStyle = 'DropDownList'
$adapter.DisplayMember = 'Label'
$form.Controls.Add($adapter)
$null = Add-Label 'Porta do site' 20 126
$port = New-Object System.Windows.Forms.NumericUpDown
$port.Location = New-Object System.Drawing.Point(20, 155)
$port.Size = New-Object System.Drawing.Size(120, 30)
$port.Minimum = 1
$port.Maximum = 65535
$port.Value = [Math]::Max(1, [Math]::Min(65535, [int]$script:config.porta))
$form.Controls.Add($port)
$save = Add-Button 'Salvar e enviar' 160 150 150
$open = Add-Button 'Abrir site' 320 150 140
$refresh = Add-Button 'Atualizar IP' 470 150 150
$urlLabel = Add-Label '' 20 204
$status = Add-Label 'Defina a porta e clique em Salvar e enviar para ativar.' 20 242
$status.Height = 64
$null = Add-Label 'Apos salvar, verifica mudancas automaticamente enquanto estiver aberto.' 20 330

function Update-Url {
    if ($adapter.SelectedItem) {
        $urlLabel.Text = "http://$($adapter.SelectedItem.IPAddress):$($port.Value)/"
    } else { $urlLabel.Text = 'Nenhum IPv4 de rede conectado encontrado.' }
}
function Refresh-Addresses {
    $previous = $adapter.SelectedItem
    $adapter.Items.Clear()
    foreach ($item in @(Get-NetworkAddresses)) { $null = $adapter.Items.Add($item) }
    $wanted = [int]$script:config.interfaceIndex
    if ($previous) { $wanted = $previous.InterfaceIndex }
    for ($i = 0; $i -lt $adapter.Items.Count; $i++) {
        if ($adapter.Items[$i].InterfaceIndex -eq $wanted) { $adapter.SelectedIndex = $i; break }
    }
    if ($adapter.SelectedIndex -lt 0 -and $adapter.Items.Count -gt 0 -and $wanted -eq 0) { $adapter.SelectedIndex = 0 }
    Update-Url
}
function Send-Address([bool]$force = $false) {
    if ($script:busy) { return }
    $selected = $adapter.SelectedItem
    if (-not $selected) { $status.Text = 'Adaptador indisponivel. Selecione uma rede e salve novamente.'; return }
    # Automatic publication uses saved settings, never unsaved edits in the UI.
    $selected = @($adapter.Items | Where-Object InterfaceIndex -eq $script:config.interfaceIndex) | Select-Object -First 1
    if (-not $selected) { $status.Text = 'Aguardando o adaptador salvo reconectar.'; return }
    $payload = [ordered]@{ servidor = $env:COMPUTERNAME; numeroip = [string]$selected.IPAddress; porta = [int]$script:config.porta } | ConvertTo-Json -Compress
    if (-not $force -and $payload -eq $script:lastSent) { return }
    $script:busy = $true
    $save.Enabled = $false
    $status.Text = 'Enviando dados para a API...'
    $script:pendingPayload = $payload
    $script:worker = [PowerShell]::Create()
    $null = $script:worker.AddScript({
        param($uri, $json)
        $ErrorActionPreference = 'Stop'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

        function Invoke-LocalIpJsonRequest {
            param([string]$Method, [string]$RequestUri, [string]$BodyJson)
            $bytes = [Text.Encoding]::UTF8.GetBytes($BodyJson)
            Invoke-WebRequest -UseBasicParsing -Uri $RequestUri -Method $Method `
                -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 20
        }

        function Get-LocalIpUpdateUri {
            param($Item, [string]$BaseUri)
            if (-not $Item) { return '' }
            $selfLink = @($Item.links | Where-Object { $_.rel -eq 'self' }) | Select-Object -First 1
            if ($selfLink -and $selfLink.href) { return [string]$selfLink.href }
            foreach ($property in 'id', 'rowid') {
                if ($Item.PSObject.Properties.Match($property).Count -gt 0 -and $null -ne $Item.$property -and [string]$Item.$property) {
                    return "$BaseUri$([uri]::EscapeDataString([string]$Item.$property))"
                }
            }
            return ''
        }

        function Get-LocalIpRows {
            param([string]$BaseUri)
            $rows = New-Object System.Collections.Generic.List[object]
            $pageUri = $BaseUri
            $seen = New-Object System.Collections.Generic.HashSet[string]
            while ($pageUri) {
                if (-not $seen.Add($pageUri) -or $seen.Count -gt 1000) { throw 'Paginacao invalida na API.' }
                $lookup = Invoke-RestMethod -Uri $pageUri -Method Get -TimeoutSec 20
                foreach ($item in @($lookup.items)) { if ($item) { $rows.Add($item) } }
                $next = @($lookup.links | Where-Object { $_.rel -eq 'next' }) | Select-Object -First 1
                if ((-not $next -or -not $next.href) -and $lookup.hasMore) { throw 'API indicou mais registros sem link de paginacao.' }
                $pageUri = if ($next -and $next.href) { [string]$next.href } else { '' }
            }
            return @($rows)
        }

        try {
            $data = $json | ConvertFrom-Json
            $baseUri = ($uri.TrimEnd('/') + '/')
            $normalized = ([string]$data.servidor).Trim().ToUpperInvariant()
            $rows = @(Get-LocalIpRows -BaseUri $baseUri)
            $matches = @($rows | Where-Object { $_.servidor -and ($_.servidor.ToString().Trim().ToUpperInvariant() -eq $normalized) })
            $othersActive = @($rows | Where-Object {
                $_.servidor -and ($_.servidor.ToString().Trim().ToUpperInvariant() -ne $normalized) -and
                $_.ativo -and ($_.ativo.ToString().Trim().ToUpperInvariant() -eq 'S')
            })
            if ($matches.Count -eq 0) {
                $payload = @{
                    servidor = [string]$data.servidor
                    numeroip = [string]$data.numeroip
                    porta = [int]$data.porta
                    ativo = 'S'
                }
                $body = $payload | ConvertTo-Json -Compress
                $response = Invoke-LocalIpJsonRequest -Method Post -RequestUri $baseUri -BodyJson $body
                $action = 'Inserido'
            } else {
                foreach ($row in $matches) {
                    $updateUri = Get-LocalIpUpdateUri -Item $row -BaseUri $baseUri
                    if (-not $updateUri) { throw 'Registro encontrado sem link para atualizar. Nenhuma linha inserida.' }
                    $payload = @{
                        servidor = [string]$row.servidor
                        numeroip = [string]$data.numeroip
                        porta = [int]$data.porta
                        ativo = 'S'
                    }
                    $body = $payload | ConvertTo-Json -Compress
                    $response = Invoke-LocalIpJsonRequest -Method Put -RequestUri $updateUri -BodyJson $body
                }
                $action = 'Atualizado'
            }
            foreach ($row in $othersActive) {
                $updateUri = Get-LocalIpUpdateUri -Item $row -BaseUri $baseUri
                if (-not $updateUri) { throw 'Outro servidor ativo esta sem link para inativar.' }
                $porta = 0
                [void][int]::TryParse([string]$row.porta, [ref]$porta)
                $body = (@{ servidor = [string]$row.servidor; numeroip = [string]$row.numeroip; porta = $porta; ativo = 'N' } | ConvertTo-Json -Compress)
                $response = Invoke-LocalIpJsonRequest -Method Put -RequestUri $updateUri -BodyJson $body
            }
            return [pscustomobject]@{ Ok = $true; Message = "$action (HTTP $($response.StatusCode))" }
        } catch {
            return [pscustomobject]@{ Ok = $false; Message = $_.Exception.Message }
        }
    }).AddArgument([string]$script:config.apiUrl).AddArgument($payload)
    $script:job = $script:worker.BeginInvoke()
}
$adapter.Add_SelectedIndexChanged({ Update-Url })
$port.Add_ValueChanged({ Update-Url })
$refresh.Add_Click({ try { Refresh-Addresses } catch { $status.Text = $_.Exception.Message } })
$open.Add_Click({ if ($adapter.SelectedItem) { Start-Process $urlLabel.Text } })
$save.Add_Click({
    try {
        if (-not $adapter.SelectedItem) { throw 'Selecione um adaptador conectado.' }
        $script:config.porta = [int]$port.Value
        $script:config.interfaceIndex = $adapter.SelectedItem.InterfaceIndex
        $script:config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
        $script:automatic = $true
        Send-Address $true
    } catch { $status.Text = $_.Exception.Message }
})
$script:automatic = Test-Path -LiteralPath $configPath
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 400
$script:nextScan = Get-Date
$timer.Add_Tick({
    try {
        if ($script:busy -and $script:job.IsCompleted) {
            try {
                $result = @($script:worker.EndInvoke($script:job)) | Select-Object -Last 1
                if ($result -and $result.Ok) {
                    $script:lastSent = $script:pendingPayload
                    $status.Text = "Publicado em $(Get-Date -Format 'HH:mm:ss') - $($result.Message)"
                } else { $status.Text = "Falha no envio. Nova tentativa automatica. $($result.Message)" }
            } finally {
                $script:worker.Dispose()
                $script:worker = $null
                $script:busy = $false
                $save.Enabled = $true
            }
        }
        if ((Get-Date) -ge $script:nextScan -and -not $script:busy) {
            $script:nextScan = (Get-Date).AddSeconds([Math]::Max(10, [int]$script:config.intervaloSegundos))
            Refresh-Addresses
            if ($script:automatic) { Send-Address }
        }
    } catch { $status.Text = $_.Exception.Message }
})
$form.Add_Shown({ $timer.Start() })
$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
    if ($script:worker) { $script:worker.Stop(); $script:worker.Dispose() }
})
try { Refresh-Addresses; [System.Windows.Forms.Application]::Run($form) }
finally { $form.Dispose() }
