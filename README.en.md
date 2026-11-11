[🇷🇺 Русский](README.md) | **🇬🇧 English**

<p align="center">
  <a href="https://senku.one" target="_blank">
    <img src="https://img.shields.io/badge/Website-senku.one-1a1a1a?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Senku Website">
  </a>
  &nbsp;&nbsp;
  <a href="https://t.me/Senkuone" target="_blank">
    <img src="https://img.shields.io/badge/Telegram-Channel-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Channel">
  </a>
  &nbsp;&nbsp;
  <!-- Новый бейдж TG Чата -->
  <a href="https://t.me/senkuchater" target="_blank">
    <img src="https://img.shields.io/badge/Telegram-Chat-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Chat">
  </a>
  &nbsp;&nbsp;
  <a href="https://discord.gg/sKkrJZJTX" target="_blank">
    <img src="https://img.shields.io/badge/Discord-Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord Server">
  </a>
  &nbsp;&nbsp;
  <a href="https://raw.githubusercontent.com/haqweti/auto-play-anime-senku/refs/heads/main/Senku%20Ultimate%20Autoplay.user.js">
    <img src="https://img.shields.io/badge/Install-Script-brightgreen?style=for-the-badge&logo=javascript&logoColor=white" alt="Install Script">
  </a>
</p>

<br>

<h1 align="center">Senku Ultimate Autoplay</h1>

<p align="center">
  <b>A new level of watching anime on Senku (<a href="https://senku.one" target="_blank">senku.one</a>).</b><br>
  A script that extends the functionality of the standard player: adds <b>auto-play for next episodes</b>, an <b>smart playlist</b>, and makes control as comfortable as possible.
</p>

<p align="center">
  <img width="1250" height="610" alt="{E69C423C-3153-4E89-9972-EA5999EB8A8B}" src="https://github.com/user-attachments/assets/7e3ca02e-10da-42e4-8822-207fb3475435" />
</p>

> [!IMPORTANT]
> To run the script, you need to install a userscript manager extension: **Tampermonkey** (Chrome, Firefox, Edge) or **OrangeMonkey**. Without it, the script will not be able to run in your browser.

---

## Features

| Module | Description |
| :--- | :--- |
| **Auto-next** | When an episode ends, the script automatically finds and plays the next one. Player freezes are bypassed automatically. |
| **Playlist** | A slide-out panel for creating a queue of seasons or other titles. Supports loading posters and titles. |
| **Smart Search** | The algorithm focuses on links and episode numbers in the DOM tree, allowing it to find episodes even in titles with a complex structure. |
| **Pause Fix** | Protection against a website bug where the video was reset to the beginning when paused. |
| **Stable Sound** | The volume slider in the panel and in the player work synchronously. The volume is not reset when switching to a new episode. |
| **Tracking** | Sending background requests (heartbeat) for correctly counting watched episodes in your profile. |
| **Interface** | The panel is made in a unified style with the website (Unbounded, blur), and can be collapsed into a compact icon. |

---

## Usage Instructions

<p align="center">
 <img width="877" height="830" alt="{96A7A059-3CB5-4BE2-86A0-95DEA3509003}" src="https://github.com/user-attachments/assets/1c1bf441-15ea-46a4-803a-328a769e8fb3" />
</p>

## Installation

> [!IMPORTANT]
> **Important requirement for Chrome and Edge (version 138+)**
> For the script to work, modern browsers require additional permission.
> After installing Tampermonkey or OrangeMonkey, **you must** enable one of the two toggles:
> 1.  In the extension's settings, find and activate **"Allow User Scripts"**.
> 2.  Or on the browser's extension management page (`chrome://extensions`), enable **"Developer Mode"**.
> Without this step, the script will not be able to run!

| Step | Action |
| :---: | :--- |
| **1** | Install a userscript manager: **Tampermonkey** or **OrangeMonkey** from your browser's extension store. |
| **2** | **Enable the "Allow User Scripts" permission** in the extension settings or activate "Developer Mode" in the browser (see the important note above). |
| **3** | Click the green **"Install Script"** button at the very top of this page. |
| **4** | In the opened userscript manager window, click the big **"Install"** button. |
| **5** | Go to [`senku.one`](https://senku.one) and start any episode. The control panel will appear in the top right corner. If the panel does not appear, press F5 on the player page. |

---

## Update Process

The script supports automatic updates. You don't need to download and reinstall the file manually every time — all new fixes and features arrive automatically.

<p align="center">
 <img width="818" height="786" alt="{8A84135B-5394-4298-A9E4-430322F1FA00}" src="https://github.com/user-attachments/assets/3fe66907-5ae6-4ee4-a972-fc49adf45fe1" />
</p>

> [!TIP]
> **The easiest way (Recommended):**
> In 99% of cases, you don't need to do anything at all. If the **"Auto-install"** checkbox is enabled in Tampermonkey/OrangeMonkey settings (it is enabled by default), the script will update in the background by itself.

### If you receive an update notification

If you see a red icon (or number) on the extension icon, it means a new version has been released:
1. Click on the **Tampermonkey** or **OrangeMonkey** extension icon.
2. In the drop-down menu, click on the line with the available update.
3. A tab will open where you just need to click the green **"Update"** button.

> [!NOTE]
> **Where does the old code go?**
> When updating, the userscript manager **completely overwrites** the old file with the new one. This is normal behavior. Your personal settings (saved queue, volume, panel position) will not be affected, as they are stored separately in the browser's memory.

<details>
<summary><b>Manual update (if auto-update failed)</b></summary>
<br>

If you want to "kick" the script and check for updates right now:
1. Click on the extension icon and select **"Dashboard"**.
2. Go to the **"Utilities"** tab.
3. Click the **"Check for userscript updates"** button.
4. If a new version appears, confirm the installation.
</details>

---

## Credits

### Senku Platform
Special thanks are expressed to the developers and administration of the [Senku](https://senku.one/) website for creating a high-quality platform for watching anime, providing access to API documentation, and being open to the development of third-party solutions. Without their support, prompt communication, and feedback, this project could not exist and develop.

### Contributors
We express personal gratitude to the developer [@Ra9ge](https://github.com/Ra9ge) for the proposed algorithm for finding the next episodes, which significantly increased the stability of the script.

If you found a bug or want to suggest an idea, you can do so through the [Issues](../../issues) section. We are open to any improvements!

---

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The project is distributed under the **MIT** license. You can freely use, modify, and distribute this code (including for commercial purposes) provided you keep the attribution. Read the [LICENSE](../../blob/main/LICENSE) file for details.

<br>

<p align="center">
  <i>Made with ❤️ for the anime community</i>
</p>
