[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [Parameter(Mandatory = $true)]
    [string]$GitHubUser,
    [Parameter(Mandatory = $true)]
    [string]$Principal
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$token = & gh auth token --hostname github.com --user $GitHubUser
if (-not $token) {
    throw "No stored GitHub credential found for $GitHubUser. Use gh auth login for that account first."
}

$env:IDENTITY_BROKER_PRINCIPAL = $Principal
$env:MARKSIGNALS_GITHUB_TOKEN = $token
$env:MARKSIGNALS_GITHUB_TOOLS = "get_file_contents,issue_read,create_issue"
try {
    & node (Join-Path $root "src/server.js") --config $ConfigPath
} finally {
    Remove-Item Env:MARKSIGNALS_GITHUB_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:MARKSIGNALS_GITHUB_TOOLS -ErrorAction SilentlyContinue
    Remove-Item Env:IDENTITY_BROKER_PRINCIPAL -ErrorAction SilentlyContinue
}
