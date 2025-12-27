# ═══════════════════════════════════════════════════════════════════════════
#  BLOGGER-MCP CONTROL CENTER (PowerShell)
#  Last Updated: 2025-12-15
# ═══════════════════════════════════════════════════════════════════════════

$Host.UI.RawUI.WindowTitle = "Blogger-MCP Control Center"

function Show-Banner {
    Clear-Host
    Write-Host @"
╔══════════════════════════════════════════════════════════════════════╗
║                 🤖 BLOGGER-MCP CONTROL CENTER                        ║
║                    Autonomous Blogging System                         ║
║                    Version 4.4.0 | Progress: 75%                     ║
╠══════════════════════════════════════════════════════════════════════╣
"@ -ForegroundColor Cyan
}

function Get-ServiceStatus {
    Write-Host "`n  SERVICE STATUS" -ForegroundColor Yellow
    Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
    
    # Check Qdrant
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:6333" -TimeoutSec 2 -UseBasicParsing
        Write-Host "  🟢 Qdrant:     localhost:6333   [Running]" -ForegroundColor Green
    } catch {
        Write-Host "  🔴 Qdrant:     localhost:6333   [Not Running]" -ForegroundColor Red
    }
    
    # Check Backend
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -TimeoutSec 2 -UseBasicParsing
        Write-Host "  🟢 Backend:    localhost:3001   [Running]" -ForegroundColor Green
    } catch {
        Write-Host "  🔴 Backend:    localhost:3001   [Not Running]" -ForegroundColor Red
    }
    
    # Check Dashboard
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 2 -UseBasicParsing
        Write-Host "  🟢 Dashboard:  localhost:5173   [Running]" -ForegroundColor Green
    } catch {
        Write-Host "  🔴 Dashboard:  localhost:5173   [Not Running]" -ForegroundColor Red
    }
}

function Show-Menu {
    Write-Host @"
║                                                                       ║
║   ═══════════════════════════════════════════════════════════════    ║
║                         MENU OPTIONS                                  ║
║   ═══════════════════════════════════════════════════════════════    ║
║                                                                       ║
║   [1]  🚀 Start All Services                                         ║
║   [2]  🛑 Stop All Services                                          ║
║   [3]  🔄 Restart All Services                                       ║
║   ───────────────────────────────────────────────────────────────    ║
║   [4]  📊 View Service Status                                        ║
║   [5]  🧪 Run Feature Tests                                          ║
║   [6]  📋 Show AGENT-MATRIX Summary                                  ║
║   ───────────────────────────────────────────────────────────────    ║
║   [7]  🌐 Open Dashboard in Browser                                  ║
║   [8]  📂 Open Project in VS Code                                    ║
║   [9]  🔧 View Server Logs                                           ║
║   ───────────────────────────────────────────────────────────────    ║
║   [10] 💾 Git Status                                                 ║
║   [11] 📤 Git Push to GitHub                                         ║
║   ───────────────────────────────────────────────────────────────    ║
║   [0]  ❌ Exit                                                       ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan
}

function Start-AllServices {
    Write-Host "`n  Starting all services..." -ForegroundColor Yellow
    
    # Start Qdrant (Docker)
    Write-Host "  → Starting Qdrant..." -ForegroundColor Cyan
    docker-compose up -d qdrant 2>$null
    
    # Start Server
    Write-Host "  → Starting Backend Server..." -ForegroundColor Cyan
    Start-Job -Name "BloggerServer" -ScriptBlock {
        Set-Location $using:PWD\server
        node dist/index.js
    } | Out-Null
    
    Start-Sleep -Seconds 3
    
    # Start Dashboard
    Write-Host "  → Starting Dashboard..." -ForegroundColor Cyan
    Start-Job -Name "BloggerDashboard" -ScriptBlock {
        Set-Location $using:PWD\dashboard
        npm run dev
    } | Out-Null
    
    Start-Sleep -Seconds 3
    Write-Host "`n  ✅ All services started!" -ForegroundColor Green
    Write-Host "  → Dashboard: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  → API: http://localhost:3001" -ForegroundColor Cyan
}

function Stop-AllServices {
    Write-Host "`n  Stopping all services..." -ForegroundColor Yellow
    
    Get-Job | Stop-Job
    Get-Job | Remove-Job
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
    
    Write-Host "  ✅ All services stopped!" -ForegroundColor Green
}

function Open-Dashboard {
    Start-Process "http://localhost:5173"
    Write-Host "  ✅ Dashboard opened in browser" -ForegroundColor Green
}

function Show-GitStatus {
    Write-Host "`n  GIT STATUS" -ForegroundColor Yellow
    Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
    git status --short
}

function Push-ToGitHub {
    Write-Host "`n  Enter commit message: " -NoNewline -ForegroundColor Yellow
    $message = Read-Host
    git add -A
    git commit -m $message
    git push origin Main-2
    Write-Host "  ✅ Pushed to GitHub!" -ForegroundColor Green
}

# Main Loop
do {
    Show-Banner
    Get-ServiceStatus
    Show-Menu
    
    Write-Host "`n  Enter choice [0-11]: " -NoNewline -ForegroundColor Yellow
    $choice = Read-Host
    
    switch ($choice) {
        "1" { Start-AllServices }
        "2" { Stop-AllServices }
        "3" { Stop-AllServices; Start-AllServices }
        "4" { Get-ServiceStatus }
        "5" { 
            Write-Host "`n  Running feature tests..." -ForegroundColor Yellow
            node tools/feature-tests.mjs --category all
        }
        "6" { Get-Content AGENT-MATRIX.md | Select-Object -First 50 }
        "7" { Open-Dashboard }
        "8" { code . }
        "9" { Get-Content server/startup.log -Tail 30 -ErrorAction SilentlyContinue }
        "10" { Show-GitStatus }
        "11" { Push-ToGitHub }
        "0" { 
            Write-Host "`n  Goodbye! 👋" -ForegroundColor Cyan
            exit 
        }
        default { Write-Host "`n  Invalid option!" -ForegroundColor Red }
    }
    
    Write-Host "`n  Press any key to continue..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
} while ($true)
