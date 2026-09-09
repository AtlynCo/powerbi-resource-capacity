param([switch]$CertificationAudit)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$toolHome = Join-Path $root '.tmp\tool-home'
$certFolder = Join-Path $toolHome 'pbiviz-certs'
New-Item -ItemType Directory -Path $certFolder -Force | Out-Null

# The SDK resolves a development certificate even for packaging. Supply a local,
# public-only PFX so it never generates or imports a persisted private key.
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=localhost', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$signed = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(7))
$public = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $signed.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
if ($public.HasPrivateKey) { throw 'Build certificate must contain no private key' }
$passphrase = [Guid]::NewGuid().ToString('N')
[System.IO.File]::WriteAllBytes((Join-Path $certFolder 'PowerBICustomVisualTest_public.pfx'),
    $public.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $passphrase))
[System.IO.File]::WriteAllText((Join-Path $certFolder 'PowerBICustomVisualTestPass.txt'), $passphrase)
$public.Dispose()
$signed.Dispose()
$rsa.Dispose()
$oldProfile = $env:USERPROFILE
$oldHome = $env:HOME
try {
    $env:USERPROFILE = $toolHome
    $env:HOME = $toolHome
    & node scripts\resources.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Localization generation failed' }
    $arguments = @('node_modules\powerbi-visuals-tools\bin\pbiviz.js', 'package', '--all-locales', '--no-stats')
    if ($CertificationAudit) { $arguments += '--certification-audit' }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Power BI package build failed' }
    & node scripts\stamp-build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build input fingerprint failed' }
} finally {
    $env:USERPROFILE = $oldProfile
    $env:HOME = $oldHome
}
