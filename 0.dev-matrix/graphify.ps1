param(
    [switch]$Status,
    [switch]$Refresh,
    [switch]$Wiki,
    [string]$Query,
    [string]$Explain,
    [string]$PathFrom,
    [string]$PathTo,
    [switch]$Serve,
    [switch]$Watch,
    [switch]$InstallHooks,
    [switch]$HooksStatus,
    [switch]$RemoveHooks
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Test-Path (Join-Path $ScriptDir '.git')) -or (Test-Path (Join-Path $ScriptDir '.github'))) {
    $RepoRoot = $ScriptDir
} else {
    $RepoRoot = Split-Path -Parent $ScriptDir
}

$Python = Join-Path $RepoRoot '.venv\Scripts\python.exe'
$GraphDir = Join-Path $RepoRoot 'graphify-out'
$GraphJson = Join-Path $GraphDir 'graph.json'
$GraphHtml = Join-Path $GraphDir 'graph.html'
$GraphReport = Join-Path $GraphDir 'GRAPH_REPORT.md'
$WikiDir = Join-Path $GraphDir 'wiki'

function Require-Python {
    if (-not (Test-Path $Python)) {
        throw "Python virtual environment not found at $Python"
    }
}

function Require-Graph {
    if (-not (Test-Path $GraphJson)) {
        throw "Graph file not found at $GraphJson. Run -Refresh first."
    }
}

function Invoke-Graphify {
    param([string[]]$Arguments)
    Require-Python
    Push-Location $RepoRoot
    try {
        & $Python -m graphify @Arguments
    }
    finally {
        Pop-Location
    }
}

function Invoke-GraphifyWiki {
    Require-Python
    Require-Graph

    $wikiScript = @"
import json
import sys
from pathlib import Path

from graphify.analyze import god_nodes
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.wiki import to_wiki

graph_path = Path(sys.argv[1])
wiki_dir = Path(sys.argv[2])

raw = json.loads(graph_path.read_text(encoding="utf-8"))
graph = build_from_json(raw)
communities = cluster(graph)
cohesion = score_all(graph, communities)
labels = {cid: f"Community {cid}" for cid in communities}
article_count = to_wiki(
    graph,
    communities,
    wiki_dir,
    community_labels=labels,
    cohesion=cohesion,
    god_nodes_data=god_nodes(graph)
)

print(f"Wiki articles written: {article_count}")
print(f"Wiki index: {wiki_dir / 'index.md'}")
"@

    $wikiScript | & $Python - $GraphJson $WikiDir
}

function Invoke-GraphifyHtml {
    Require-Python
    Require-Graph

    $htmlScript = @"
import json
import sys
from pathlib import Path

from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.export import to_html

graph_path = Path(sys.argv[1])
html_path = Path(sys.argv[2])

raw = json.loads(graph_path.read_text(encoding="utf-8"))
graph = build_from_json(raw)
communities = cluster(graph)
to_html(graph, communities, str(html_path))

print(f"HTML written: {html_path}")
"@

    $htmlScript | & $Python - $GraphJson $GraphHtml
}

function Get-SectionBullets {
    param(
        [string]$Content,
        [string]$Heading,
        [int]$MaxCount = 2
    )

    if ([string]::IsNullOrWhiteSpace($Content) -or [string]::IsNullOrWhiteSpace($Heading)) {
        return @()
    }

    $lines = $Content -split "`r?`n"
    $capture = $false
    $results = @()

    foreach ($line in $lines) {
        if ($line -match ('^##\s+' + [regex]::Escape($Heading) + '\s*$')) {
            $capture = $true
            continue
        }

        if ($capture -and $line -match '^##\s+') {
            break
        }

        if ($capture -and $line -match '^-\s+') {
            $results += $line.Trim()
            if ($results.Count -ge $MaxCount) {
                break
            }
        }
    }

    return $results
}

if (-not $PSBoundParameters.Count) {
    $Status = $true
}

if ($Refresh) {
    Invoke-Graphify @('update', '.')

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Invoke-GraphifyHtml

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    if ($Wiki) {
        Invoke-GraphifyWiki

        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    exit $LASTEXITCODE
}

if ($Wiki) {
    Invoke-GraphifyWiki
    exit $LASTEXITCODE
}

if ($Watch) {
    Invoke-Graphify @('watch', '.')
    exit $LASTEXITCODE
}

if ($InstallHooks) {
    Invoke-Graphify @('hook', 'install')
    exit $LASTEXITCODE
}

if ($HooksStatus) {
    Invoke-Graphify @('hook', 'status')
    exit $LASTEXITCODE
}

if ($RemoveHooks) {
    Invoke-Graphify @('hook', 'uninstall')
    exit $LASTEXITCODE
}

if ($Query) {
    Require-Graph
    Invoke-Graphify @('query', $Query, '--graph', $GraphJson)
    exit $LASTEXITCODE
}

if ($Explain) {
    Require-Graph
    Invoke-Graphify @('explain', $Explain, '--graph', $GraphJson)
    exit $LASTEXITCODE
}

if ($PathFrom -or $PathTo) {
    if ([string]::IsNullOrWhiteSpace($PathFrom) -or [string]::IsNullOrWhiteSpace($PathTo)) {
        throw 'Use both -PathFrom and -PathTo together.'
    }

    Require-Graph
    Invoke-Graphify @('path', $PathFrom, $PathTo, '--graph', $GraphJson)
    exit $LASTEXITCODE
}

if ($Serve) {
    Require-Python
    Require-Graph
    Push-Location $RepoRoot
    try {
        & $Python -m graphify.serve $GraphJson
    }
    finally {
        Pop-Location
    }
    exit $LASTEXITCODE
}

if ($Status) {
    Write-Host ''
    Write-Host '=== Graphify Status ===' -ForegroundColor Cyan
    Write-Host "Repo: $(Split-Path $RepoRoot -Leaf)"
    Write-Host "Python: $Python"

    if (-not (Test-Path $GraphReport)) {
        Write-Host '- No Graphify report found yet.' -ForegroundColor Yellow
        Write-Host '- Run: powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Refresh'
        Write-Host '- For a richer code + docs + media refresh, run /graphify . in Copilot Chat.'
        exit 0
    }

    $reportContent = Get-Content $GraphReport -Raw -Encoding utf8
    $corpusLines = Get-SectionBullets -Content $reportContent -Heading 'Corpus Check' -MaxCount 2
    $summaryLines = Get-SectionBullets -Content $reportContent -Heading 'Summary' -MaxCount 2

    Write-Host '- Report: graphify-out/GRAPH_REPORT.md' -ForegroundColor Green
    Write-Host '- Graph: graphify-out/graph.json' -ForegroundColor Green
    if (Test-Path (Join-Path $GraphDir 'graph.html')) {
        Write-Host '- HTML: graphify-out/graph.html' -ForegroundColor Green
    }
    if (Test-Path (Join-Path $WikiDir 'index.md')) {
        Write-Host '- Wiki: graphify-out/wiki/index.md' -ForegroundColor Green
    }

    foreach ($line in ($corpusLines + $summaryLines)) {
        Write-Host $line
    }

    Write-Host ''
    Write-Host 'Common commands' -ForegroundColor Yellow
    Write-Host '- Refresh: powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Refresh'
    Write-Host '- Wiki:    powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Wiki'
    Write-Host '- Query:   powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Query "your query"'
    Write-Host '- Explain: powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Explain "NodeName"'
    Write-Host '- Path:    powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -PathFrom "A" -PathTo "B"'
    Write-Host '- Serve:   powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Serve'
    Write-Host '- Refresh + wiki: powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Refresh -Wiki'
    Write-Host '- Full multimodal refresh: /graphify .'
    exit 0
}