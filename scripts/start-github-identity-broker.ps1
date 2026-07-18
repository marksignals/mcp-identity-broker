[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [Parameter(Mandatory = $true)]
    [string]$GitHubUser,
    [Parameter(Mandatory = $true)]
    [string]$Principal,
    [Parameter(Mandatory = $true)]
    [string]$Identity,
    [string]$Provider = "github"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$identityConfig = $config.identities.PSObject.Properties[$Identity].Value
if (-not $identityConfig) {
    throw "Identity '$Identity' is not configured."
}
$providerConfig = $identityConfig.providers.PSObject.Properties[$Provider].Value
if (-not $providerConfig) {
    throw "Provider '$Provider' is not configured for identity '$Identity'."
}

$tokenReference = $providerConfig.env.PSObject.Properties["GITHUB_PERSONAL_ACCESS_TOKEN"].Value
if ($tokenReference -notmatch '^\$\{([A-Z][A-Z0-9_]*)\}$') {
    throw "The provider must map GITHUB_PERSONAL_ACCESS_TOKEN to an environment-variable reference."
}
$tokenVariable = $Matches[1]

$toolsReference = $providerConfig.env.PSObject.Properties["GITHUB_TOOLS"].Value
if ($toolsReference -and $toolsReference -notmatch '^\$\{([A-Z][A-Z0-9_]*)\}$') {
    throw "GITHUB_TOOLS must be an environment-variable reference when configured."
}
$toolsVariable = if ($toolsReference) { $Matches[1] } else { $null }
$principalVariable = if ($config.principal_env) { $config.principal_env } else { "IDENTITY_BROKER_PRINCIPAL" }

$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
if ($ghCommand) {
    $ghPath = $ghCommand.Source
} else {
    $ghCandidates = @("C:\Program Files\GitHub CLI\gh.exe")
    foreach ($programFiles in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($programFiles) {
            $ghCandidates += Join-Path $programFiles "GitHub CLI\gh.exe"
        }
    }
    $ghCandidates = $ghCandidates | Where-Object { Test-Path -LiteralPath $_ }
    $ghPath = $ghCandidates | Select-Object -First 1
}
if (-not $ghPath) {
    throw "GitHub CLI was not found. Install GitHub CLI or add gh.exe to PATH."
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodePath = $nodeCommand.Source
} else {
    $nodeCandidates = @("C:\Program Files\nodejs\node.exe")
    foreach ($programFiles in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($programFiles) {
            $nodeCandidates += Join-Path $programFiles "nodejs\node.exe"
        }
    }
    $nodeCandidates = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ }
    $nodePath = $nodeCandidates | Select-Object -First 1
}
if (-not $nodePath) {
    throw "Node.js was not found. Install Node.js 20 or later or add node.exe to PATH."
}

$token = & $ghPath auth token --hostname github.com --user $GitHubUser
if (-not $token) {
    throw "No stored GitHub credential found for $GitHubUser. Use gh auth login for that account first."
}

Set-Item -LiteralPath "Env:$principalVariable" -Value $Principal
Set-Item -LiteralPath "Env:$tokenVariable" -Value $token
if ($toolsVariable) {
    Set-Item -LiteralPath "Env:$toolsVariable" -Value ($providerConfig.allowed_tools -join ",")
}
try {
    & $nodePath (Join-Path $root "src/server.js") --config $ConfigPath
} finally {
    Remove-Item -LiteralPath "Env:$tokenVariable" -ErrorAction SilentlyContinue
    if ($toolsVariable) {
        Remove-Item -LiteralPath "Env:$toolsVariable" -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath "Env:$principalVariable" -ErrorAction SilentlyContinue
}
