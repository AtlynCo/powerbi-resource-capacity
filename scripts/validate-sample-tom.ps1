param(
    [string]$TomAssembly = $env:CAPACITY_TOM_ASSEMBLY,
    [string]$Definition = 'samples\AtlynResourceCapacity\AtlynResourceCapacity.SemanticModel\definition'
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not $TomAssembly) { throw 'Supply -TomAssembly or CAPACITY_TOM_ASSEMBLY for an installed official Microsoft.AnalysisServices.Tabular.dll; no installation is performed.' }
$assemblyPath = (Resolve-Path -LiteralPath $TomAssembly).Path
$definitionPath = (Resolve-Path -LiteralPath $Definition).Path
$assemblyName = [System.Reflection.AssemblyName]::GetAssemblyName($assemblyPath)
if ($assemblyName.Name -ne 'Microsoft.AnalysisServices.Tabular') { throw 'Expected the official Microsoft.AnalysisServices.Tabular assembly' }
Add-Type -Path $assemblyPath
$database = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($definitionPath)
if ($database.Model.Tables.Count -ne 2) { throw 'Expected exactly the People and Machines tables' }
$tables = foreach ($name in @('People', 'Machines')) {
    $table = $database.Model.Tables.Find($name)
    if ($null -eq $table -or $table.Columns.Count -ne 7 -or $table.Measures.Count -ne 6 -or $table.Partitions.Count -ne 1) {
        throw "Unexpected deserialized sample structure: $name"
    }
    $partitionSource = $table.Partitions[0].Source
    if ($null -eq $partitionSource -or $partitionSource.GetType().Name -ne 'MPartitionSource') {
        throw "Expected an offline M partition: $name"
    }
    [ordered]@{ name = $table.Name; columns = $table.Columns.Count; measures = $table.Measures.Count
        partitions = $table.Partitions.Count; partitionSourceType = $partitionSource.GetType().Name }
}
[ordered]@{
    status = 'passed'
    scope = 'Official TOM deserialization only. No M/DAX execution, Desktop render/save/reopen, service or export proof.'
    assembly = $assemblyName.FullName
    assemblySha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $assemblyPath).Hash.ToLowerInvariant()
    powershell = $PSVersionTable.PSVersion.ToString()
    runtime = [System.Runtime.InteropServices.RuntimeInformation]::FrameworkDescription
    compatibilityLevel = $database.CompatibilityLevel
    tables = @($tables)
} | ConvertTo-Json -Depth 6
