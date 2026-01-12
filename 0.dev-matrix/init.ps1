#
# Telegram MCP - Initialization Script (PowerShell)
# Integrates with agent-matrix and menu-chart system
#
# Version: 2.11.0
# Last Updated: 2025-01-06
#
# Usage:
#   .\init.ps1              # Full initialization
#   .\init.ps1 -Dev         # Development mode
#   .\init.ps1 -Test        # Run all tests
#   .\init.ps1 -Verify      # Verify features.json
#   .\init.ps1 -Health      # Health check only
#

param(
    [switch]$Dev,
    [switch]$Test,
    [switch]$Verify,
    [switch]$Health,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Script directory - navigate to project root (parent of 0.development-matrix)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# Colors
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) { Write-Output $args }
    $host.UI.RawUI.ForegroundColor = $fc
}

# Banner
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    TELEGRAM MCP INITIALIZER                        ║" -ForegroundColor Cyan
Write-Host "║              v2.11.0 | Heroku v423 | Health 17/18                  ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Load version
try {
    $Package = Get-Content "package.json" | ConvertFrom-Json
    $Version = $Package.version
} catch {
    $Version = "2.8.1"
}
Write-Host "Version: $Version" -ForegroundColor Blue
Write-Host ""

# ===========================================================================
# AGENT MATRIX - Core Agents
# ===========================================================================
$Agents = @(
    @{Name="deploymentAgent"; File="lib/autonomous-deployment-agent.js"},
    @{Name="recoveryAgent"; File="lib/auto-recovery.js"},
    @{Name="contentAgent"; File="lib/content-generator.js"},
    @{Name="analyticsAgent"; File="lib/analytics-system.js"}
)

# ===========================================================================
# MENU CHART - Module System
# ===========================================================================
$Modules = @(
    @{Code="M1"; Name="RSS Feed Management"; File="lib/enhanced-rss-automation.js"},
    @{Code="M2"; Name="Channel Management"; File="lib/channel-manager.js"},
    @{Code="M3"; Name="Group Management"; File="lib/group-manager.js"},
    @{Code="M4"; Name="Scheduling"; File="lib/advanced-scheduler.js"},
    @{Code="M5"; Name="Automation"; File="lib/automation-engine.js"},
    @{Code="M6"; Name="Analytics"; File="lib/analytics-system.js"},
    @{Code="M7"; Name="Social Media"; File="lib/social-media-integrator.js"},
    @{Code="M8"; Name="Website Monitor"; File="lib/website-monitor.js"},
    @{Code="M9"; Name="Security"; File="lib/security-manager.js"},
    @{Code="M10"; Name="Settings"; File="lib/comprehensive-admin-menu.js"}
)

# ===========================================================================
# WIZARDS - Multi-step Input System
# ===========================================================================
$Wizards = @(
    @{Code="W1"; Name="RSS Wizard"; File="lib/menus/wizards/rss-wizard.js"},
    @{Code="W2"; Name="Channel Wizard"; File="lib/menus/wizards/channel-wizard.js"},
    @{Code="W3"; Name="Group Wizard"; File="lib/menus/wizards/group-wizard.js"},
    @{Code="W4"; Name="Schedule Wizard"; File="lib/menus/wizards/schedule-wizard.js"},
    @{Code="W5"; Name="Format Wizard"; File="lib/menus/wizards/format-wizard.js"},
    @{Code="W6"; Name="Timezone Wizard"; File="lib/menus/wizards/timezone-wizard.js"}
)

# ===========================================================================
# FUNCTIONS
# ===========================================================================

function Test-NodeInstalled {
    Write-Host "Checking Node.js..." -ForegroundColor Blue
    try {
        $NodeVersion = node -v
        Write-Host "  ✓ Node.js $NodeVersion installed" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  ✗ Node.js not found. Please install Node.js 22.x" -ForegroundColor Red
        return $false
    }
}

function Test-NpmInstalled {
    Write-Host "Checking npm..." -ForegroundColor Blue
    try {
        $NpmVersion = npm -v
        Write-Host "  ✓ npm $NpmVersion installed" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  ✗ npm not found" -ForegroundColor Red
        return $false
    }
}

function Install-Dependencies {
    Write-Host "`nInstalling dependencies..." -ForegroundColor Blue
    npm install
    Write-Host "  ✓ Dependencies installed" -ForegroundColor Green
}

function Test-Agents {
    Write-Host "`n=== AGENT MATRIX VERIFICATION ===" -ForegroundColor Cyan
    $passed = 0
    $failed = 0
    
    foreach ($agent in $Agents) {
        if (Test-Path $agent.File) {
            Write-Host "  ✓ $($agent.Name): $($agent.File)" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "  ✗ $($agent.Name): $($agent.File) (MISSING)" -ForegroundColor Red
            $failed++
        }
    }
    
    Write-Host "`n  Agents: $passed passed, $failed failed"
}

function Test-Modules {
    Write-Host "`n=== MENU CHART MODULES ===" -ForegroundColor Cyan
    $passed = 0
    $failed = 0
    
    foreach ($module in $Modules) {
        if (Test-Path $module.File) {
            Write-Host "  ✓ [$($module.Code)] $($module.Name)" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "  ✗ [$($module.Code)] $($module.Name) (MISSING: $($module.File))" -ForegroundColor Red
            $failed++
        }
    }
    
    Write-Host "`n  Modules: $passed passed, $failed failed"
}

function Test-Wizards {
    Write-Host "`n=== WIZARD SYSTEM ===" -ForegroundColor Cyan
    $passed = 0
    $failed = 0
    
    foreach ($wizard in $Wizards) {
        if (Test-Path $wizard.File) {
            Write-Host "  ✓ [$($wizard.Code)] $($wizard.Name)" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "  ✗ [$($wizard.Code)] $($wizard.Name) (MISSING: $($wizard.File))" -ForegroundColor Red
            $failed++
        }
    }
    
    Write-Host "`n  Wizards: $passed passed, $failed failed"
}

function Test-Syntax {
    Write-Host "`n=== SYNTAX VERIFICATION ===" -ForegroundColor Cyan
    $errors = 0
    
    Get-ChildItem -Path "lib" -Filter "*.js" -Recurse | Select-Object -First 20 | ForEach-Object {
        try {
            $null = node --check $_.FullName 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ $($_.Name)" -ForegroundColor Green
            } else {
                Write-Host "  ✗ $($_.Name) - SYNTAX ERROR" -ForegroundColor Red
                $errors++
            }
        } catch {
            Write-Host "  ✗ $($_.Name) - SYNTAX ERROR" -ForegroundColor Red
            $errors++
        }
    }
    
    if ($errors -eq 0) {
        Write-Host "`n  All files pass syntax check" -ForegroundColor Green
    } else {
        Write-Host "`n  $errors files have syntax errors" -ForegroundColor Red
    }
}

function Test-FeaturesJson {
    Write-Host "`n=== FEATURES.JSON VERIFICATION ===" -ForegroundColor Cyan
    
    if (Test-Path "features.json") {
        try {
            $features = Get-Content "features.json" -Raw | ConvertFrom-Json
            Write-Host "  ✓ features.json is valid JSON" -ForegroundColor Green
            
            $total = $features.testResults.summary.total
            $passing = $features.testResults.summary.passing
            $comingSoon = $features.testResults.summary.coming_soon
            
            Write-Host "  Test Summary:" -ForegroundColor Blue
            Write-Host "    Total Features: $total"
            Write-Host "    Passing: $passing" -ForegroundColor Green
            Write-Host "    Coming Soon: $comingSoon" -ForegroundColor Yellow
        } catch {
            Write-Host "  ✗ features.json has invalid JSON syntax" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✗ features.json not found" -ForegroundColor Red
    }
}

function Invoke-HealthCheck {
    Write-Host "`n=== HEALTH CHECK ===" -ForegroundColor Cyan
    
    if (Test-Path "scripts/health-check.js") {
        try {
            node scripts/health-check.js
        } catch {
            Write-Host "  ⚠ Health check script needs update" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠ Health check script not found" -ForegroundColor Yellow
    }
    
    # Check Heroku if CLI available
    try {
        $herokuCheck = Get-Command heroku -ErrorAction SilentlyContinue
        if ($herokuCheck) {
            Write-Host "`nHeroku Status:" -ForegroundColor Blue
            heroku ps --app telegram-mcp-unified 2>$null | Select-Object -First 5
        }
    } catch {
        # Heroku not available
    }
}

function Invoke-Tests {
    Write-Host "`n=== RUNNING TESTS ===" -ForegroundColor Cyan
    try {
        npm test
    } catch {
        Write-Host "  ⚠ Some tests may need attention" -ForegroundColor Yellow
    }
}

function Show-MenuChart {
    Write-Host "`n=== MENU CHART REFERENCE ===" -ForegroundColor Cyan
    Write-Host "Main Entry: /admin, /start, /menu → admin_main" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Module Callbacks:" -ForegroundColor Blue
    Write-Host "  [M1]  admin_rss        - RSS Feed Management"
    Write-Host "  [M2]  admin_channels   - Channel Management"
    Write-Host "  [M3]  admin_groups     - Group Management"
    Write-Host "  [M4]  admin_schedule   - Scheduling"
    Write-Host "  [M5]  admin_automation - Automation & Content"
    Write-Host "  [M6]  admin_analytics  - Analytics"
    Write-Host "  [M7]  admin_social     - Social Media"
    Write-Host "  [M8]  admin_website    - Website Monitor"
    Write-Host "  [M9]  admin_security   - Security"
    Write-Host "  [M10] admin_settings   - Settings"
    Write-Host ""
    Write-Host "Error Reporting: Use format 'M1.2 not working'" -ForegroundColor Blue
    Write-Host "Full Chart: See MENU-CHART.md" -ForegroundColor Blue
}

function Show-AgentMatrix {
    Write-Host "`n=== AGENT MATRIX ===" -ForegroundColor Cyan
    Write-Host "Active Agents:" -ForegroundColor Blue
    Write-Host "  🤖 Deployment Agent - Auto-deploy, rollback, health monitoring"
    Write-Host "  🔧 Recovery Agent   - Self-healing, error detection, auto-restart"
    Write-Host "  📝 Content Agent    - AI generation, templates, multi-provider"
    Write-Host "  📊 Analytics Agent  - Metrics collection, reporting, export"
    Write-Host ""
    Write-Host "Agent Capabilities:" -ForegroundColor Blue
    Write-Host "  • Autonomous operations without human intervention"
    Write-Host "  • 24/7 uptime on Heroku eco dyno"
    Write-Host "  • Error detection and self-correction"
    Write-Host "  • Scheduled content posting"
}

function Show-Help {
    Write-Host "Usage: .\init.ps1 [OPTION]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  (none)     Full initialization"
    Write-Host "  -Dev       Development mode setup"
    Write-Host "  -Test      Run all tests"
    Write-Host "  -Verify    Verify features.json and agents"
    Write-Host "  -Health    Health check only"
    Write-Host "  -Help      Show this help"
    Show-MenuChart
    Show-AgentMatrix
}

# ===========================================================================
# MAIN EXECUTION
# ===========================================================================

if ($Help) {
    Show-Help
    exit 0
}

if ($Dev) {
    Write-Host "Development Mode" -ForegroundColor Yellow
    Test-NodeInstalled | Out-Null
    Test-NpmInstalled | Out-Null
    Install-Dependencies
    Test-Agents
    Test-Modules
    Test-Wizards
    Test-FeaturesJson
    exit 0
}

if ($Test) {
    Write-Host "Test Mode" -ForegroundColor Yellow
    Test-Syntax
    Invoke-Tests
    Test-FeaturesJson
    exit 0
}

if ($Verify) {
    Write-Host "Verify Mode" -ForegroundColor Yellow
    Test-Agents
    Test-Modules
    Test-Wizards
    Test-Syntax
    Test-FeaturesJson
    exit 0
}

if ($Health) {
    Write-Host "Health Check Mode" -ForegroundColor Yellow
    Invoke-HealthCheck
    exit 0
}

# Full initialization
Test-NodeInstalled | Out-Null
Test-NpmInstalled | Out-Null
Install-Dependencies
Write-Host ""
Test-Agents
Test-Modules
Test-Wizards
Test-Syntax
Test-FeaturesJson
Write-Host ""
Show-MenuChart
Show-AgentMatrix
Write-Host ""
Invoke-HealthCheck

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    INITIALIZATION COMPLETE                        ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Start bot:      " -NoNewline; Write-Host "npm start" -ForegroundColor Cyan
Write-Host "Start MCP:      " -NoNewline; Write-Host "npm run mcp" -ForegroundColor Cyan
Write-Host "Run tests:      " -NoNewline; Write-Host "npm test" -ForegroundColor Cyan
Write-Host "Deploy:         " -NoNewline; Write-Host "git push heroku main" -ForegroundColor Cyan
Write-Host ""
