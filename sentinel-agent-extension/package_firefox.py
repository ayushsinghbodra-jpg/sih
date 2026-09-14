#!/usr/bin/env python3
"""
SentinelAgent - Firefox Add-on Packager
Builds a ready-to-load Firefox extension package with manifest.firefox.json.
"""

import os
import shutil
import zipfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_ZIP = os.path.join(SCRIPT_DIR, "sentinel-agent-firefox.xpi")

EXCLUDE_DIRS = {"__pycache__", ".git", "server"}
EXCLUDE_FILES = {"manifest.json", "sentinel-agent-firefox.xpi", "package_firefox.py"}

def build_firefox_addon():
    print(f"Building Firefox Add-on: {OUTPUT_ZIP}")
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zipf:
        # Write manifest.firefox.json as manifest.json in the zip
        firefox_manifest_path = os.path.join(SCRIPT_DIR, "manifest.firefox.json")
        zipf.write(firefox_manifest_path, "manifest.json")
        print("  + Added manifest.json (from manifest.firefox.json)")

        # Walk and write all other extension files
        for root, dirs, files in os.walk(SCRIPT_DIR):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if file in EXCLUDE_FILES or file.endswith(".pyc"):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, SCRIPT_DIR)
                zipf.write(file_path, arcname)
                print(f"  + Added {arcname}")

    print(f"\n✅ Build complete: {OUTPUT_ZIP} ({os.path.getsize(OUTPUT_ZIP) / 1024:.1f} KB)")
    print("Load in Firefox at about:debugging#/runtime/this-firefox -> 'Load Temporary Add-on...'")

if __name__ == "__main__":
    build_firefox_addon()
