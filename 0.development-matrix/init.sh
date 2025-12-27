#!/bin/bash
#===============================================================================
# BLOGGER-MCP AUTONOMOUS BLOGGING SYSTEM - INIT SCRIPT
# Integrated with AGENT-MATRIX.md for Claude Code development
# Version: 3.1.0 | Updated: December 6, 2025
#===============================================================================

set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

#===============================================================================
# BANNER
#===============================================================================
show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════════╗"
    echo "║     🤖 BLOGGER-MCP - AUTONOMOUS BLOGGING SYSTEM                       ║"
    echo "║     AI Research → Generate → Optimize → Publish → Analyze             ║"
    echo "╠═══════════════════════════════════════════════════════════════════════╣"
    echo "║  Version: 3.1.0          Phase 0: ✅ COMPLETE                         ║"
    echo "║  Updated: 2025-12-07     Phase 1: 🔴 BLOCKED (backend down)           ║"
    echo "║  NOTE: Run start-all.bat first, then re-check status before testing.  ║"
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
        echo "│  [1]  Start All Services                                            │"
        echo "│  [2]  Stop All Services                                             │"
        echo "│  [3]  Restart All Services                                          │"
        echo "│  [4]  View Service Status                                           │"
        echo "│  [5]  Run Feature Tests (sub-menu)                                  │"
        echo "│  [6]  Show AGENT-MATRIX Summary                                     │"
        echo "│  [7]  Execute Phase (Claude Code) (sub-menu)                        │"
        echo "│  [8]  Generate Claude Prompt (copy to clipboard, best effort)       │"
        echo "│  [9]  Check features.json                                           │"
        echo "│  [10] Open Dashboard                                                │"
        echo "│  [11] Open Project in VS Code                                       │"
        echo "│  [12] View Logs                                                     │"
        echo "│  [13] Git Status & Commit                                           │"
        echo "│  [14] Git Push                                                      │"
        echo "├─────────────────────────────────────────────────────────────────────┤"
        echo "│  [0]  Exit                                                          │"
    echo "└─────────────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
}

open_url() {
    url="$1"
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
        open "$url" >/dev/null 2>&1 || true
    else
        echo "Open in browser: $url"
    fi
}

copy_to_clipboard() {
    text="$1"
    if command -v pbcopy >/dev/null 2>&1; then
        printf "%s" "$text" | pbcopy
        echo "Copied to clipboard (pbcopy)."
    elif command -v xclip >/dev/null 2>&1; then
        printf "%s" "$text" | xclip -selection clipboard
        echo "Copied to clipboard (xclip)."
    elif command -v wl-copy >/dev/null 2>&1; then
        printf "%s" "$text" | wl-copy
        echo "Copied to clipboard (wl-copy)."
    else
        echo "Clipboard tool not found. Printing prompt:\n"
        echo "$text"
    fi
}

feature_tests_menu() {
    while true; do
        clear
        show_banner
        show_progress
        check_status
        echo -e "${YELLOW}"
        echo "┌─────────────────────────────────────────────────────────────────────┐"
        echo "│                     FEATURE TEST MENU                               │"
        echo "├─────────────────────────────────────────────────────────────────────┤"
        echo "│  [1]  Infrastructure Tests (Qdrant/Backend/Dashboard)                │"
        echo "│  [2]  Authentication Tests                                           │"
        echo "│  [3]  Content Generation Tests                                       │"
        echo "│  [4]  Publishing Tests                                               │"
        echo "│  [5]  SEO Engine Tests                                               │"
        echo "│  [6]  Knowledge Base Tests                                           │"
        echo "│  [7]  Search Console Tests                                           │"
        echo "│  [A]  Run ALL Tests                                                  │"
        echo "│  [U]  Update features.json                                           │"
        echo "│  [B]  Back                                                          │"
        echo "└─────────────────────────────────────────────────────────────────────┘"
        echo -e "${NC}"

        read -r -p "Select option: " tchoice
        tchoice=$(echo "$tchoice" | tr -d ' ' | tr '[:lower:]' '[:upper:]')

        case "$tchoice" in
            B) return ;;
            1) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category infra ; read -r -p "Press Enter..." ;;
            2) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category auth ; read -r -p "Press Enter..." ;;
            3) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category content ; read -r -p "Press Enter..." ;;
            4) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category publishing ; read -r -p "Press Enter..." ;;
            5) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category seo ; read -r -p "Press Enter..." ;;
            6) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category knowledge ; read -r -p "Press Enter..." ;;
            7) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category search-console ; read -r -p "Press Enter..." ;;
            A) node "$PROJECT_ROOT/tools/feature-tests.mjs" --category all ; read -r -p "Press Enter..." ;;
            U) node "$PROJECT_ROOT/tools/update-features.mjs" ; read -r -p "Press Enter..." ;;
            *) echo "Invalid option" ; sleep 1 ;;
        esac
    done
}

phase_menu() {
    while true; do
        clear
        show_banner
        echo -e "${YELLOW}"
        echo "┌─────────────────────────────────────────────────────────────────────┐"
        echo "│                     PHASE EXECUTION MENU                             │"
        echo "├─────────────────────────────────────────────────────────────────────┤"
        echo "│  [0]  Phase 0: Critical Fixes                                        │"
        echo "│  [1]  Phase 1: Verification                                          │"
        echo "│  [2]  Phase 2: Dashboard                                             │"
        echo "│  [3]  Phase 3: Authentication                                        │"
        echo "│  [4]  Phase 4: AI Content                                            │"
        echo "│  [5]  Phase 5: Auto-Publishing                                       │"
        echo "│  [6]  Phase 6: SEO Engine                                            │"
        echo "│  [7A] Phase 7A: Analytics                                            │"
        echo "│  [7B] Phase 7B: Knowledge Base                                       │"
        echo "│  [7C] Phase 7C: Monitoring                                           │"
        echo "│  [8]  Phase 8: Testing                                               │"
        echo "│  [9]  Phase 9: Deployment                                            │"
        echo "│  [B]  Back                                                          │"
        echo "└─────────────────────────────────────────────────────────────────────┘"
        echo -e "${NC}"

        read -r -p "Enter phase: " pchoice
        pchoice=$(echo "$pchoice" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
        [ "$pchoice" = "B" ] && return

        prompt=$(printf "Execute AGENT-MATRIX.md Phase %s.\n\nGoal: implement + verify Phase %s end-to-end.\nConstraints: update features.json + docs after verification." "$pchoice" "$pchoice")
        copy_to_clipboard "$prompt"
        read -r -p "Press Enter..."
    done
}

#===============================================================================
# PROGRESS CHART
#===============================================================================
show_progress() {
    echo -e "${BLUE}"
    echo "┌─────────────────────────────────────────────────────────────────────┐"
    echo "│                    PROJECT COMPLETION STATUS                         │"
    echo "├─────────────────────────────────────────────────────────────────────┤"
    echo "│  Phase 0: Critical Fixes    ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  Phase 1: Verification      ░░░░░░░░░░░░░░░░░░░░   0%  🔄 NEXT      │"
    echo "│  Phase 2: Integration       ████████░░░░░░░░░░░░  40%  ⚠️ PARTIAL  │"
    echo "│  Phase 3: Authentication    ████████████████████ 100%  ✅ COMPLETE  │"
    echo "│  Phase 4: AI Content        ████████░░░░░░░░░░░░  40%  ⚠️ PARTIAL  │"
    echo "│  Phase 5: Auto-Publish      ████░░░░░░░░░░░░░░░░  20%  ❌ TODO      │"
    echo "│  Phase 6: SEO Engine        ████████░░░░░░░░░░░░  40%  ⚠️ PARTIAL  │"
    echo "│  Phase 7B: Knowledge Base   ░░░░░░░░░░░░░░░░░░░░   0%  ❌ TODO      │"
    echo "│  Phase 7C: Monitoring       ████░░░░░░░░░░░░░░░░  20%  ❌ TODO      │"
    echo "├─────────────────────────────────────────────────────────────────────┤"
    echo "│  OVERALL PROGRESS           ████████░░░░░░░░░░░░  40%              │"
    echo "└─────────────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
}

#===============================================================================
# SERVICE FUNCTIONS
#===============================================================================
start_all_services() {
    echo -e "${GREEN}Starting all services...${NC}"
    
    # Start Qdrant
    echo -e "${CYAN}[1/3] Starting Qdrant...${NC}"
    docker-compose up -d qdrant 2>/dev/null || docker compose up -d qdrant
    sleep 3
    
    # Start Server
    echo -e "${CYAN}[2/3] Starting Express Server...${NC}"
    cd "$PROJECT_ROOT/server"
    npm run dev &
    SERVER_PID=$!
    sleep 4
    
    # Start Dashboard
    echo -e "${CYAN}[3/3] Starting React Dashboard...${NC}"
    cd "$PROJECT_ROOT/dashboard"
    npm run dev &
    DASHBOARD_PID=$!
    
    echo -e "${GREEN}"
    echo "✅ All services started!"
    echo "   Qdrant:    http://localhost:6333"
    echo "   Server:    http://localhost:3001"
    echo "   Dashboard: http://localhost:5173"
    echo -e "${NC}"
}

check_status() {
    echo -e "${BLUE}Checking service status...${NC}"
    echo ""
    
    # Check Qdrant
    echo -n "Qdrant (6333):    "
    if curl -s http://localhost:6333/collections > /dev/null 2>&1; then
        echo -e "${GREEN}✅ RUNNING${NC}"
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
    fi
    
    # Check Server
    echo -n "Server (3001):    "
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ RUNNING${NC}"
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
    fi
    
    # Check Dashboard
    echo -n "Dashboard (5173): "
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ RUNNING${NC}"
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
    fi
    echo ""
}

run_tests() {
    echo -e "${YELLOW}Running API endpoint tests...${NC}"
    
    endpoints=("health" "blogs" "sources" "seo/trends/summary" "auth/status")
    
    for ep in "${endpoints[@]}"; do
        echo -n "/api/$ep: "
        response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/$ep")
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✅ PASS (200)${NC}"
        else
            echo -e "${RED}❌ FAIL ($response)${NC}"
        fi
    done
}

view_features() {
    echo -e "${CYAN}Feature Status from features.json:${NC}"
    echo ""
    if command -v jq &> /dev/null; then
        cat "$PROJECT_ROOT/features.json" | jq '.phases'
    else
        cat "$PROJECT_ROOT/features.json"
    fi
}

install_dependencies() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    
    echo -e "${CYAN}[1/2] Server dependencies...${NC}"
    cd "$PROJECT_ROOT/server" && npm install
    
    echo -e "${CYAN}[2/2] Dashboard dependencies...${NC}"
    cd "$PROJECT_ROOT/dashboard" && npm install
    
    echo -e "${GREEN}✅ Dependencies installed!${NC}"
}

git_status() {
    cd "$PROJECT_ROOT"
    echo -e "${BLUE}Git Status:${NC}"
    git status
    echo ""
    echo -e "${YELLOW}Recent commits:${NC}"
    git log --oneline -5
}

stop_all() {
    echo -e "${RED}Stopping all services...${NC}"
    pkill -f "tsx src/index.ts" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
}

#===============================================================================
# PHASE EXECUTION PROMPTS
#===============================================================================
show_phase_prompt() {
    phase=$1
    case $phase in
        1)
            echo -e "${CYAN}Phase 1 - Verification & Fixes${NC}"
            echo ""
            echo "Copy this prompt for Claude Code:"
            echo ""
            echo -e "${YELLOW}Execute AGENT-MATRIX.md Phase 1 - Verification & Fixes."
            echo ""
            echo "Phase 0 is COMPLETE. Infrastructure is stable. Now verify all code works:"
            echo ""
            echo "Tasks:"
            echo "1. Test ALL 46 API endpoints - create test script"
            echo "2. Test database CRUD operations"
            echo "3. Verify WebSocket connectivity"
            echo "4. Test AI content generation endpoint"
            echo "5. Document any failing endpoints"
            echo ""
            echo "Services running: Qdrant :6333, Backend :3001, Dashboard :5173${NC}"
            ;;
        4)
            echo -e "${CYAN}Phase 4 - AI Content Generation${NC}"
            echo ""
            echo "Copy this prompt for Claude Code:"
            echo ""
            echo -e "${YELLOW}Execute AGENT-MATRIX.md Phase 4 - AI Content Generation."
            echo ""
            echo "Focus: Make the AI write complete blog posts"
            echo ""
            echo "Tasks:"
            echo "1. Test POST /api/content/generate"
            echo "2. Verify Gemini/OpenRouter integration"
            echo "3. Test SEO title generation"
            echo "4. Test meta description generation"
            echo "5. End-to-end: generate full blog post${NC}"
            ;;
        5)
            echo -e "${CYAN}Phase 5 - Auto-Publishing${NC}"
            echo ""
            echo "Copy this prompt for Claude Code:"
            echo ""
            echo -e "${YELLOW}Execute AGENT-MATRIX.md Phase 5 - Auto-Publishing."
            echo ""
            echo "Focus: Publish AI content to Blogger automatically"
            echo ""
            echo "Tasks:"
            echo "1. Fix blogger-publish.ts service"
            echo "2. Test POST /api/publish/now"
            echo "3. Create end-to-end: generate → publish"
            echo "4. Verify post appears on Blogger${NC}"
            ;;
        7)
            echo -e "${CYAN}Phase 7B - Knowledge Base (Qdrant)${NC}"
            echo ""
            echo "Copy this prompt for Claude Code:"
            echo ""
            echo -e "${YELLOW}Execute AGENT-MATRIX.md Phase 7B - Knowledge Base."
            echo ""
            echo "Focus: Build semantic search with Qdrant"
            echo ""
            echo "Tasks:"
            echo "1. Create Qdrant collections (income_tax, gst, ignou)"
            echo "2. Implement embedding generation"
            echo "3. Scrape IGNOU announcements and index"
            echo "4. Build semantic search endpoint"
            echo "5. Test: search 'IGNOU admission'${NC}"
            ;;
        8)
            echo -e "${CYAN}Phase 7C - Website Monitoring${NC}"
            echo ""
            echo "Copy this prompt for Claude Code:"
            echo ""
            echo -e "${YELLOW}Execute AGENT-MATRIX.md Phase 7C - Website Monitoring."
            echo ""
            echo "Focus: Actively check sources for changes"
            echo ""
            echo "Tasks:"
            echo "1. Fix scheduler.ts to trigger checks"
            echo "2. Create source-checker.ts"
            echo "3. Add 'Check Now' button to UI"
            echo "4. Test with IGNOU source${NC}"
            ;;
    esac
}

#===============================================================================
# MAIN LOOP
#===============================================================================
main() {
    while true; do
        clear
        show_banner
        show_progress
        check_status
        show_menu
        
        read -p "Select option: " choice
        
        case $choice in
            1) start_all_services; read -r -p "Press Enter to continue..." ;;
            2) stop_all; read -r -p "Press Enter to continue..." ;;
            3) stop_all; start_all_services; read -r -p "Press Enter to continue..." ;;
            4) check_status; read -r -p "Press Enter to continue..." ;;
            5) feature_tests_menu ;;
            6) cat "$PROJECT_ROOT/AGENT-MATRIX.md" | head -120; read -r -p "Press Enter to continue..." ;;
            7) phase_menu ;;
            8) copy_to_clipboard "Execute AGENT-MATRIX.md for the next unfinished phase.\n\nFirst: run node tools/feature-tests.mjs --category all and paste results."; read -r -p "Press Enter to continue..." ;;
            9) view_features; read -r -p "Press Enter to continue..." ;;
            10) open_url "http://localhost:5173"; read -r -p "Press Enter to continue..." ;;
            11) if command -v code >/dev/null 2>&1; then code "$PROJECT_ROOT"; else echo "VS Code CLI ('code') not found"; fi; read -r -p "Press Enter to continue..." ;;
            12) if [ -d "$PROJECT_ROOT/server/logs" ]; then ls -la "$PROJECT_ROOT/server/logs"; else echo "No server/logs directory yet."; fi; read -r -p "Press Enter to continue..." ;;
            13) git status; read -r -p "Commit message (blank to cancel): " msg; if [ -n "$msg" ]; then git add -A && git commit -m "$msg"; fi; read -r -p "Press Enter to continue..." ;;
            14) git push; read -r -p "Press Enter to continue..." ;;
            0) echo "Goodbye!"; exit 0 ;;
            *) echo "Invalid option"; sleep 1 ;;
        esac
    done
}

# Run main or specific command
if [ "$1" = "start" ]; then
    start_all_services
elif [ "$1" = "status" ]; then
    check_status
elif [ "$1" = "test" ]; then
    run_tests
elif [ "$1" = "stop" ]; then
    stop_all
else
    main
fi
