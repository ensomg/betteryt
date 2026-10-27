# BetterYT Privacy Policy

BetterYT does not collect, sell or transmit personal data. It has no analytics and no telemetry.

- **Settings** are stored in your browser (`chrome.storage`). If "Sync settings" is on, your
  browser syncs them through your browser account. BetterYT never sees that data.
- **Network requests.** BetterYT only contacts these public APIs, and only when you turn on the
  matching feature:
  - SponsorBlock (`sponsor.ajay.app`) to fetch skip segments. Only the first 4 characters of a
    SHA-256 hash of the video ID are sent.
  - Return YouTube Dislike (`returnyoutubedislikeapi.com`) to fetch vote estimates for the video
    you are watching.
  - Update check (`raw.githubusercontent.com/ensomg/betteryt`): once a day BetterYT downloads a
    small public `update.json` file to see whether a newer version exists. Nothing is sent
    besides the request itself. Turn it off in Settings → General.
- Local data (watched videos, watch-time statistics, time saved, ad-blocking log) never leaves
  your device and can be cleared from the settings page.
