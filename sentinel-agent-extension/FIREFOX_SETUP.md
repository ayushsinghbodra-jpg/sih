# Firefox Setup & Portability Guide — SentinelAgent

SentinelAgent is built for full cross-browser compatibility across **Google Chrome**, **Mozilla Firefox**, and **Chromium-based browsers**.

---

### Loading SentinelAgent in Firefox (1-Click Method)

1. Open **Mozilla Firefox**.
2. Navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Click **"Load Temporary Add-on..."**.
4. Select the file:
   ```text
   sentinel-agent-extension/manifest.firefox.json
   ```
   *(or select the bundled `sentinel-agent-firefox.xpi`)*.
5. The **SentinelAgent** icon will immediately appear in your Firefox toolbar.

---

### Re-packaging the Firefox Add-on
To re-bundle all perception models, libraries, and assets for Firefox:
```bash
python3 sentinel-agent-extension/package_firefox.py
```
Output: `sentinel-agent-extension/sentinel-agent-firefox.xpi`
