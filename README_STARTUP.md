# TruckOptimum - One-Click Startup Guide

## 🚀 Quick Start

**Easiest way to start TruckOptimum:**

1. **Double-click** `start_TruckOptimum_Enhanced.bat`
2. **Wait** for the application to start
3. **Your browser will open automatically** to the application

## 📁 Available Scripts

### 1. `start_TruckOptimum.bat` (Basic)
- Simple startup script
- Checks Python and installs Flask if needed
- Starts the application

### 2. `start_TruckOptimum_Enhanced.bat` (Recommended) ⭐
- **Best option for most users**
- Enhanced with colorful output and detailed status
- Checks all dependencies
- Auto-installs required packages
- Creates logs directory
- Provides clear error messages and instructions

### 3. `install_desktop_shortcut.bat` (Optional)
- Creates desktop and Start Menu shortcuts
- Makes it even easier to launch the app
- Creates an uninstaller script
- **Run this once after downloading**

## 🔧 System Requirements

- **Python 3.7 or higher** (Download from [python.org](https://python.org))
- **Internet connection** (for first-time setup to download Flask)
- **Windows 7/8/10/11**

⚠️ **Important:** When installing Python, make sure to check "Add Python to PATH"

## 🚦 First-Time Setup

1. **Install Python** (if not already installed)
   - Download from [python.org](https://python.org)
   - ✅ Check "Add Python to PATH" during installation
   - Restart your computer after installation

2. **Run the startup script**
   - Double-click `start_TruckOptimum_Enhanced.bat`
   - The script will automatically install Flask
   - Wait for the browser to open

3. **Create shortcuts** (Optional)
   - Run `install_desktop_shortcut.bat`
   - Double-click the desktop icon to start next time

## 🎯 Usage

Once started, the application will:
- Open automatically in your default browser
- Run on `http://127.0.0.1:5001`
- Display the TruckOptimum interface
- Be ready to use for truck loading optimization

To stop the application:
- Press `Ctrl+C` in the command window
- Or simply close the command window

## 🔍 Troubleshooting

### "Python is not installed or not in PATH"
**Solution:**
1. Install Python from [python.org](https://python.org)
2. ✅ Check "Add Python to PATH" during installation
3. Restart your computer
4. Try running the script again

### "Failed to install Flask"
**Solutions:**
1. **Check internet connection**
2. **Run as Administrator:**
   - Right-click the batch file
   - Select "Run as administrator"
3. **Manual installation:**
   - Open Command Prompt as Administrator
   - Run: `pip install flask`

### "Application file not found"
**Solution:**
- Make sure you're running the script from the correct directory
- The script should be in the same folder as the `TruckOptimum` folder
- Don't move individual files - keep the folder structure intact

### Port 5001 is already in use
**Solution:**
- The application will try to use a different port
- Or stop other applications using port 5001
- Check for other Flask applications running

## 📁 File Structure

```
your-folder/
├── start_TruckOptimum.bat              # Basic startup
├── start_TruckOptimum_Enhanced.bat     # Enhanced startup (recommended)
├── install_desktop_shortcut.bat        # Creates shortcuts
├── README_STARTUP.md                   # This file
├── TruckOptimum/                       # Main application folder
│   ├── app.py                         # Main application
│   ├── templates/                     # Web templates
│   └── ... (other app files)
└── logs/                              # Created automatically
```

## 🎉 Features

- **Automatic dependency management**
- **Beautiful colored output**
- **Error detection and helpful messages**
- **Desktop and Start Menu shortcuts**
- **Automatic browser opening**
- **Logging support**
- **Cross-port compatibility**

## 📞 Need Help?

If you encounter issues:
1. **Check the troubleshooting section above**
2. **Ensure Python is properly installed**
3. **Try running as Administrator**
4. **Check your internet connection**
5. **Verify all files are in the correct locations**

---

**🎯 One-Click Operation:** Simply double-click `start_TruckOptimum_Enhanced.bat` and enjoy!