# ORo Web Dashboard Setup Guide

## Overview
This setup script installs all dependencies for the ORo Web Dashboard, which consists of:
- **Backend**: FastAPI server with ZMQ integration
- **Frontend**: Vanilla JavaScript dashboard UI

## Prerequisites
- Linux/macOS system
- Python 3.7+
- pip3 package manager

### System Requirements Installation

For Ubuntu/Debian:
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

For macOS (using Homebrew):
```bash
brew install python3
```

## Quick Start

### Automated Setup
```bash
# Make the script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

The script will:
1. Check for Python and pip
2. Create a Python virtual environment
3. Install all dependencies
4. Verify the installation
5. Provide startup instructions

### Manual Setup
If you prefer manual setup:

```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Starting the Dashboard

### With Virtual Environment (Recommended)
```bash
# Activate virtual environment
source .venv/bin/activate

# Start the server
uvicorn backend.bridge:app --host 0.0.0.0 --port 8000
```

### Development Mode (with auto-reload)
```bash
source .venv/bin/activate
uvicorn backend.bridge:app --host 0.0.0.0 --port 8000 --reload
```

### Access the Dashboard
Open your browser and navigate to:
```
http://localhost:8000
```

## Dependencies

### Backend (Python)
- **fastapi** (0.104.1) - Modern Python web framework
- **uvicorn** (0.24.0) - ASGI server for running FastAPI
- **pydantic** (2.5.0) - Data validation using Python type annotations
- **pyzmq** (25.1.2) - ZMQ messaging library for inter-process communication
- **python-dotenv** (1.0.0) - Environment variable management

### Frontend
- Pure vanilla JavaScript (no build process needed)
- Uses WebSocket for real-time communication
- CSS styling with Google Fonts

## Project Structure

```
web_dashboard/
├── setup.sh              # Automated setup script
├── requirements.txt      # Python dependencies
├── README.md            # This file
├── backend/
│   └── bridge.py        # FastAPI application & ZMQ bridge
├── frontend/            # Frontend source (if applicable)
└── static/
    ├── index.html       # Dashboard UI
    ├── app.js          # Dashboard JavaScript
    └── style.css       # Dashboard styling
```

## Environment Configuration

Create a `.env` file in the dashboard directory to configure:
```env
# Server settings
HOST=0.0.0.0
PORT=8000
DEBUG=False

# ZMQ endpoints (customize as needed)
ZMQ_SENSORS_URL=tcp://127.0.0.1:5001
ZMQ_SYSTEM_URL=tcp://127.0.0.1:5002
ZMQ_STATUS_URL=tcp://127.0.0.1:5003
ZMQ_COMMANDS_URL=tcp://127.0.0.1:5010
```

## Troubleshooting

### Python Not Found
```bash
# Install Python 3
sudo apt install python3 python3-pip python3-venv
```

### pip Permission Error
```bash
# Use --user flag or activate virtual environment first
source .venv/bin/activate
pip install -r requirements.txt
```

### Port Already in Use
```bash
# Use a different port
uvicorn backend.bridge:app --port 8001
```

### ZMQ Connection Issues
- Verify ZMQ endpoints are configured correctly in `bridge.py`
- Ensure ZMQ services are running and accessible
- Check firewall rules for port access

### Virtual Environment Issues
```bash
# Remove and recreate
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Development Tips

### Adding New Dependencies
1. Install the package: `pip install package_name`
2. Add to `requirements.txt`
3. Commit changes to version control

### Updating Dependencies
```bash
# Update all packages
pip install --upgrade -r requirements.txt

# Update specific package
pip install --upgrade fastapi
```

### Running in Production
For production deployment, consider using:
- **Gunicorn** with Uvicorn workers
- **Nginx** as reverse proxy
- SSL/TLS certificates
- Process manager (systemd, supervisor)

Example with Gunicorn:
```bash
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.bridge:app
```

## Support & Documentation

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Uvicorn Documentation](https://www.uvicorn.org/)
- [PyZMQ Documentation](https://zeromq.org/languages/python/)
- [Pydantic Documentation](https://docs.pydantic.dev/)

## License

See project root LICENSE file for licensing information.
