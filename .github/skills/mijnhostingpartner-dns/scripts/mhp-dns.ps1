param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $CliArguments
)

$ErrorActionPreference = 'Stop'
$project = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')
$entryPoint = Join-Path $project 'dist\cli.js'

if (-not (Test-Path $entryPoint)) {
    throw "CLI is niet gebouwd. Voer uit: npm run build --prefix `"$project`""
}

& node $entryPoint @CliArguments
exit $LASTEXITCODE
