param([switch]$SkipPerformance)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$logs = Join-Path (Get-Location) 'dist\local-evidence'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$gateFile = Join-Path $logs 'gates.json'
if (Test-Path -LiteralPath $gateFile) { Remove-Item -LiteralPath $gateFile }
$results = [System.Collections.Generic.List[object]]::new()
function Invoke-Gate([string]$Name, [string[]]$Arguments) {
    $started = [DateTimeOffset]::UtcNow
    & npm @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $logs "$Name.log")
    $exitCode = $LASTEXITCODE
    $results.Add([ordered]@{ name = $Name; command = "npm $($Arguments -join ' ')"; exitCode = $exitCode
        startedAt = $started.ToString('o'); finishedAt = [DateTimeOffset]::UtcNow.ToString('o') })
    if ($exitCode -ne 0) { throw "Local gate failed: $Name ($exitCode)" }
}
& node scripts\generate-icon.mjs
if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed' }
Invoke-Gate 'typecheck' @('run', 'typecheck')
Invoke-Gate 'lint' @('run', 'lint')
Invoke-Gate 'unit' @('test')
# This is the final package build. Every subsequent package check uses these bytes.
Invoke-Gate 'sdk-audit' @('run', 'audit:sdk')
Invoke-Gate 'browser' @('run', 'test:browser')
Invoke-Gate 'package-audit' @('run', 'audit:certification')
Invoke-Gate 'runtime-dependencies' @('run', 'audit:dependencies')
Invoke-Gate 'all-dependencies' @('run', 'audit:all-dependencies')
Invoke-Gate 'capture' @('run', 'capture')
if (-not $SkipPerformance) { Invoke-Gate 'performance' @('run', 'benchmark') }
Invoke-Gate 'sample-binding' @('run', 'sample:bind', '--', '--validate-schemas')
$config = Get-Content -Raw pbiviz.json | ConvertFrom-Json
$package = Join-Path 'dist' "$($config.visual.guid).$($config.visual.version).pbiviz"
$evidence = [ordered]@{
    packageSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $package).Hash.ToLowerInvariant()
    scope = 'Local engineering only. Not Power BI Desktop/service, legal approval or Microsoft certification.'
    node = (& node --version); npm = (& npm --version); powershell = $PSVersionTable.PSVersion.ToString()
    browserChannel = $env:CAPACITY_BROWSER_CHANNEL; performanceSkipped = [bool]$SkipPerformance
    gates = $results
}
$evidence | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $logs 'gates.json')
