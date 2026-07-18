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

$token = & gh auth token --hostname github.com --user $GitHubUser
if (-not $token) {
    throw "No stored GitHub credential found for $GitHubUser. Use gh auth login for that account first."
}

Set-Item -LiteralPath "Env:$principalVariable" -Value $Principal
Set-Item -LiteralPath "Env:$tokenVariable" -Value $token
if ($toolsVariable) {
    Set-Item -LiteralPath "Env:$toolsVariable" -Value ($providerConfig.allowed_tools -join ",")
}
try {
    & node (Join-Path $root "src/server.js") --config $ConfigPath
} finally {
    Remove-Item -LiteralPath "Env:$tokenVariable" -ErrorAction SilentlyContinue
    if ($toolsVariable) {
        Remove-Item -LiteralPath "Env:$toolsVariable" -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath "Env:$principalVariable" -ErrorAction SilentlyContinue
}
