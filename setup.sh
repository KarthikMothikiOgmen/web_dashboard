#!/bin/bash

################################################################################
# ORo Web Dashboard Setup Script
# Installs all dependencies for the web dashboard backend and frontend
################################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
REQUIREMENTS_FILE="${SCRIPT_DIR}/requirements.txt"

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
}

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

################################################################################
# System Checks
################################################################################

check_python() {
    print_info "Checking Python installation..."
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed"
        print_info "Install with: sudo apt install python3 python3-pip python3-venv"
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    print_success "Python 3 found: $PYTHON_VERSION"
}

check_pip() {
    print_info "Checking pip installation..."
    
    if ! command -v pip3 &> /dev/null; then
        print_error "pip3 is not installed"
        print_info "Install with: sudo apt install python3-pip"
        exit 1
    fi
    
    PIP_VERSION=$(pip3 --version | awk '{print $2}')
    print_success "pip3 found: $PIP_VERSION"
}

################################################################################
# Virtual Environment Setup
################################################################################

setup_venv() {
    print_header "Setting up Python Virtual Environment"
    
    if [ -d "$VENV_DIR" ]; then
        print_warning "Virtual environment already exists at $VENV_DIR"
        read -p "Do you want to recreate it? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Removing existing virtual environment..."
            rm -rf "$VENV_DIR"
        else
            print_info "Using existing virtual environment"
            return
        fi
    fi
    
    print_info "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    print_success "Virtual environment created"
}

activate_venv() {
    print_info "Activating virtual environment..."
    source "${VENV_DIR}/bin/activate"
    print_success "Virtual environment activated"
}

################################################################################
# Dependency Installation
################################################################################

create_requirements() {
    print_info "Creating requirements.txt..."
    
    cat > "$REQUIREMENTS_FILE" << 'EOF'
# FastAPI Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0

# ZMQ Messaging
pyzmq==25.1.2

# Development and utilities
python-dotenv==1.0.0
EOF
    
    print_success "requirements.txt created"
}

install_dependencies() {
    print_header "Installing Python Dependencies"
    
    if [ ! -f "$REQUIREMENTS_FILE" ]; then
        create_requirements
    fi
    
    print_info "Upgrading pip..."
    pip3 install --upgrade pip setuptools wheel > /dev/null 2>&1
    print_success "pip upgraded"
    
    print_info "Installing dependencies from requirements.txt..."
    pip3 install -r "$REQUIREMENTS_FILE"
    print_success "Dependencies installed"
}

################################################################################
# Verification
################################################################################

verify_installation() {
    print_header "Verifying Installation"
    
    print_info "Checking FastAPI installation..."
    python3 -c "import fastapi; print(f'FastAPI version: {fastapi.__version__}')" && print_success "FastAPI OK" || print_error "FastAPI failed"
    
    print_info "Checking uvicorn installation..."
    python3 -c "import uvicorn; print(f'Uvicorn version: {uvicorn.__version__}')" && print_success "Uvicorn OK" || print_error "Uvicorn failed"
    
    print_info "Checking PyZMQ installation..."
    python3 -c "import zmq; print(f'PyZMQ version: {zmq.__version__}')" && print_success "PyZMQ OK" || print_error "PyZMQ failed"
    
    print_info "Checking Pydantic installation..."
    python3 -c "import pydantic; print(f'Pydantic version: {pydantic.__version__}')" && print_success "Pydantic OK" || print_error "Pydantic failed"
}

################################################################################
# Frontend Setup
################################################################################

setup_frontend() {
    print_header "Frontend Setup"
    
    if [ -d "${SCRIPT_DIR}/static" ]; then
        print_success "Static assets directory found"
        print_info "Frontend is vanilla JavaScript (no build required)"
        
        # Check for required files
        for file in app.js index.html style.css; do
            if [ -f "${SCRIPT_DIR}/static/$file" ]; then
                print_success "Found: $file"
            else
                print_warning "Missing: $file"
            fi
        done
    else
        print_warning "Static assets directory not found"
    fi
}

################################################################################
# Post-Installation Instructions
################################################################################

print_instructions() {
    print_header "Installation Complete!"
    
    echo -e "\n${GREEN}Next steps:${NC}\n"
    
    echo "1. ${BLUE}Activate the virtual environment:${NC}"
    echo "   source ${VENV_DIR}/bin/activate"
    
    echo -e "\n2. ${BLUE}Start the web dashboard server:${NC}"
    echo "   cd ${SCRIPT_DIR}"
    echo "   uvicorn backend.bridge:app --host 0.0.0.0 --port 8000"
    
    echo -e "\n3. ${BLUE}Access the dashboard:${NC}"
    echo "   http://localhost:8000"
    
    echo -e "\n${YELLOW}For development with auto-reload:${NC}"
    echo "   uvicorn backend.bridge:app --host 0.0.0.0 --port 8000 --reload"
    
    echo -e "\n${YELLOW}Configuration:${NC}"
    echo "   - Backend: Python/FastAPI in backend/bridge.py"
    echo "   - Frontend: Vanilla JS in static/"
    echo "   - Requirements: $REQUIREMENTS_FILE"
    echo ""
}

################################################################################
# Main Execution
################################################################################

main() {
    print_header "ORo Web Dashboard Setup"
    
    echo -e "Location: ${SCRIPT_DIR}\n"
    
    # Pre-checks
    check_python
    check_pip
    
    # Setup
    setup_venv
    activate_venv
    
    # Install dependencies
    install_dependencies
    
    # Verify
    verify_installation
    
    # Frontend
    setup_frontend
    
    # Instructions
    print_instructions
}

# Run main function
main "$@"
