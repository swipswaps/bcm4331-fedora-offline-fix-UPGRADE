import pystray
from PIL import Image, ImageDraw
import webbrowser
import requests
import threading
import os

# Configuration - Change this if your dev server runs on a different port
APP_URL = "http://localhost:3000"
API_FIX = f"{APP_URL}/api/fix"

def create_icon_image(color):
    # Create a simple 64x64 icon
    image = Image.new('RGB', (64, 64), color=(0, 0, 0))
    dc = ImageDraw.Draw(image)
    dc.ellipse((10, 10, 54, 54), fill=color)
    return image

def on_open_dashboard(icon, item):
    webbrowser.open(APP_URL)

def on_quick_fix(icon, item):
    def run_fix():
        try:
            print(f"Triggering fix at {API_FIX}...")
            response = requests.post(API_FIX, timeout=5)
            if response.ok:
                print("Recovery triggered successfully via Tray")
                icon.notify("Broadcom Recovery Initiated", "Check the dashboard for progress.")
            else:
                print(f"Server returned error: {response.status_code}")
                icon.notify("Recovery Failed", f"Server returned {response.status_code}")
        except Exception as e:
            print(f"Error triggering fix: {e}")
            icon.notify("Connection Error", "Could not reach the Control Center server.")
            
    threading.Thread(target=run_fix).start()

def on_exit(icon, item):
    icon.stop()

# Define the Tray Menu
menu = pystray.Menu(
    pystray.MenuItem("Open Dashboard", on_open_dashboard),
    pystray.MenuItem("Trigger Quick Fix", on_quick_fix),
    pystray.Menu.Separator(),
    pystray.MenuItem("Exit", on_exit)
)

icon = pystray.Icon("BroadcomKit", create_icon_image("blue"), "Broadcom Control", menu)

print("Broadcom Tray Applet started.")
print(f"Targeting Dashboard at: {APP_URL}")
icon.run()
