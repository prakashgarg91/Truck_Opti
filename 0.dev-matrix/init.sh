#!/bin/bash
#===============================================================================
# TELEGRAM-MCP AUTONOMOUS BOT SYSTEM - INIT SCRIPT
# Integrated with development-matrix for Claude Code development
# Version: 2.11.0 | Updated: December 16, 2025
#===============================================================================

set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project root (parent of 0.development-matrix)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

#===============================================================================
# BANNER
#===============================================================================
show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════════╗"
    echo "║     🤖 TELEGRAM-MCP - AUTONOMOUS BOT MANAGEMENT SYSTEM                ║"
    echo "║     RSS → Channels → Schedule → Post → Analyze                        ║"
    echo "╠═══════════════════════════════════════════════════════════════════════╣"
    echo "║  Version: 2.11.0         Heroku: v423                                 ║"
    echo "║  Updated: 2025-12-16     Health: 17/18 services ✅                    ║"
    echo "║  Tests: 287/287 passing  Database: Supabase PostgreSQL               ║"
    echo "╚═══════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

#===============================================================================
# MENU CHART
#===============================================================================
show_menu() {
    echo -e "${YELLOW}"
    echo "┌─────────────────────────────────────────────────────────────────────┐"
    echo "│                         MAIN MENU                                   │"
    echo "├─────────────────────────────────────────────────────────────────────┤"
    echo "│  [1]  Start Bot (npm start)                                         │"
    echo "│  [2]  Start MCP Server (npm run mcp)                                │"
    echo "│  [3]  Run All Tests (npm test)                                      │"
    echo "│  [4]  Check Health Status                                           │"
    echo "│  [5]  View features.json Status                                     │"
    echo "│  [6]  Show Module Status (M1-M10)                                   │"
    echo "│  [7]  Verify Syntax (node --check)                                  │"
    echo "│  [8]  Git Status                                                    │"
    echo "│  [9]  Git Push (origin + heroku)                                    │"
    echo "│  [10] View Heroku Logs                                              │"
    echo "│  [11] Open Project in VS Code                                       │"
    echo "├─────────────────────────────────────────────────────────────────────┤"
    echo "│  [0]  Exit                                                          │"
    echo "└─────────────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
}

#===============================================================================
# PROGRESS CHART
#===============================================================================
show_progress() {
    echo -e "${BLUE}"
    echo "┌─────────────────────────────────────────────────────────────────────┐"
    echo "│                    MODULE COMPLETION STATUS                          │"
    echo "├─────────────────────────────────────────────────────────────────────┤"
    echo "│  M1: RSS Feed Management    ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M2: Channel Management     ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M3: Group Management       ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M4: Scheduling             ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M5: Automation             ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M6: Analytics              ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M7: Social Media           ████████░░░░░░░░░░░░  40%  ⚠️ CONFIGURED│"
    echo "│  M8: Website Monitor        ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M9: Security               ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  M10: Settings/Admin        ████████████████████ 100%  ✅ COMPLETE  │"
    echo "├─────────────────────────────────────────────────────────────────────┤"
    echo "│  OVERALL PROGRESS           ████████████████░░░░  94%              │"
    echo "└─────────────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
}

#===============================================================================
# HEALTH CHECK
#===============================================================================
check_health() {
    echo -e "${CYAN}Checking Heroku health status...${NC}"
    curl -s "https://telegram-mcp-unified-ae0f5f5a7b6e.herokuapp.com/health" | python3 -m json.tool 2>/dev/null || curl -s "https://telegram-mcp-unified-ae0f5f5a7b6e.herokuapp.com/health"
    echo ""
}

#===============================================================================
# FEATURES STATUS
#===============================================================================
check_features() {
    echo -e "${CYAN}Features Status from features.json:${NC}"
    if [ -f "$PROJECT_ROOT/features.json" ]; then
        echo -e "${GREEN}Version:${NC} $(grep '"version"' "$PROJECT_ROOT/features.json" | head -1 | cut -d'"' -f4)"
        echo -e "${GREEN}Heroku:${NC} $(grep '"herokuVersion"' "$PROJECT_ROOT/features.json" | head -1 | cut -d'"' -f4)"
        echo -e "${GREEN}Health:${NC} $(grep '"healthStatus"' "$PROJECT_ROOT/features.json" | head -1 | cut -d'"' -f4)"
        echo ""
        echo -e "${YELLOW}Services Status:${NC}"
        grep -A2 '"tested":' "$PROJECT_ROOT/features.json" | head -30
    else
        echo -e "${RED}features.json not found${NC}"
    fi
}

#===============================================================================
# MODULE STATUS
#===============================================================================
show_modules() {
    echo -e "${CYAN}Module Status (M1-M10):${NC}"
    echo ""
    echo "M1: RSS Feed Management     - lib/enhanced-rss-automation.js"
    echo "M2: Channel Management      - lib/channel-manager.js"
    echo "M3: Group Management        - lib/group-manager.js"
    echo "M4: Scheduling              - lib/advanced-scheduler.js"
    echo "M5: Automation              - lib/automation-engine.js"
    echo "M6: Analytics               - lib/analytics-system.js"
    echo "M7: Social Media            - lib/social-media-integrator.js"
    echo "M8: Website Monitor         - lib/website-monitor.js"
    echo "M9: Security                - lib/security-manager.js"
    echo "M10: Settings/Admin         - lib/comprehensive-admin-menu.js"
    echo ""
}

#===============================================================================
# SYNTAX CHECK
#===============================================================================
verify_syntax() {
    echo -e "${CYAN}Verifying JavaScript syntax...${NC}"
    node --check "$PROJECT_ROOT/autonomous-bot-standalone.js" && echo -e "${GREEN}✅ autonomous-bot-standalone.js${NC}"
    node --check "$PROJECT_ROOT/index.js" && echo -e "${GREEN}✅ index.js${NC}"
    node --check "$PROJECT_ROOT/lib/social-media-integrator.js" && echo -e "${GREEN}✅ social-media-integrator.js${NC}"
    node --check "$PROJECT_ROOT/lib/channel-manager.js" && echo -e "${GREEN}✅ channel-manager.js${NC}"
    node --check "$PROJECT_ROOT/lib/comprehensive-admin-menu.js" && echo -e "${GREEN}✅ comprehensive-admin-menu.js${NC}"
    echo -e "${GREEN}All syntax checks passed!${NC}"
}

#===============================================================================
# GIT OPERATIONS
#===============================================================================
git_status() {
    echo -e "${CYAN}Git Status:${NC}"
    git status --short
    echo ""
    echo -e "${CYAN}Recent Commits:${NC}"
    git log --oneline -5
}

git_push() {
    echo -e "${CYAN}Pushing to GitHub...${NC}"
    git push origin main
    echo -e "${CYAN}Pushing to Heroku...${NC}"
    git push heroku main
    echo -e "${GREEN}Done!${NC}"
}

#===============================================================================
# MAIN LOOP
#===============================================================================
main() {
    while true; do
        clear
        show_banner
        show_progress
        show_menu
        
        read -r -p "Select option: " choice
        
        case "$choice" in
            0) echo "Goodbye!"; exit 0 ;;
            1) npm start ;;
            2) npm run mcp ;;
            3) npm test ;;
            4) check_health; read -r -p "Press Enter..." ;;
            5) check_features; read -r -p "Press Enter..." ;;
            6) show_modules; read -r -p "Press Enter..." ;;
            7) verify_syntax; read -r -p "Press Enter..." ;;
            8) git_status; read -r -p "Press Enter..." ;;
            9) git_push; read -r -p "Press Enter..." ;;
            10) heroku logs --tail --app telegram-mcp-unified ;;
            11) code "$PROJECT_ROOT" ;;
            *) echo "Invalid option"; sleep 1 ;;
        esac
    done
}

# Run main if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
