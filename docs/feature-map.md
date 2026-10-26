# Website features

Reviewed October 25, 2026. RIINC is the private development repository; the
public GitHub Pages mirror receives an explicit release PR.

| ID | Visitor path | Source | Verification recipe | Current evidence |
| --- | --- | --- | --- | --- |
| services.discover | Home, Services navigation | index.html, preview.css | Read hero and service groups at desktop and narrow widths | Browser: black computed background; 22px desktop heading; 320/390px iframe layouts fit without horizontal overflow |
| projects.explore | Work, project links and screenshot disclosures | index.html | Read contributions; expand screenshot; follow public destinations | Source destinations checked; project screenshots retained behind disclosures |
| inquiry.prepare | Header, hero, contact, or service Start button | project-assistant.mjs | Start AI agent brief, enter goal, Remote, Flexible, review; Escape closes and restores opener | Browser passed; brief remains unsent; reopening from Networks preserves existing AI draft |
| inquiry.send | Review, Send project brief, private return link | inbox-client.mjs, conversation.mjs | Confirm durable receipt, reopen private link, read/reply using synthetic data | Transport and SQLite tests pass; production send not exercised in this release |
| lab.status | Hidden until a feed is configured | public-status.mjs | Hidden controller must not mount, request, or poll; enabled controller validates freshness | Unit tests pass; browser confirms hidden; no live feed enabled |
| private.tools | Footer Private tools disclosure | index.html | Expand tools; existing access gates remain | Launchers and gate source preserved; no authentication bypass or private-content inspection |

65 Node tests pass; inbox Worker artifact and migration validation pass.
Browser checks used http://terminal.local:4173. Mobile checks used same-origin
320px and 390px iframes (305px and 375px usable widths with browser scrollbars).
They test responsive layout, not physical mobile device performance.

Use associated labels and actual IDs. Escape closes the project dialog and
returns focus to its opener. There are no custom global keyboard shortcuts.
The inquiry guide uses fixed responses; it is not a newly deployed AI agent.

October 26, 2026: `projects.explore` now includes Everything Screen and Gutters,
a website and homeowner-education card with the native link accessible name
`Everything Screen and Gutters website`. Chrome navigation through Work and
clicking the link reached wisdomscreen.pro with HTTP 200. At 320, 390, 768 and
1280 CSS pixels the card fits without horizontal overflow; page/card backgrounds
remain black and all original anchors are preserved. All 65 Node tests and inbox
build/artifact validation pass in both the private source and public mirror.
Local browser evidence: `proof/wisdomscreen-20261026/result.json` and layout PNGs
(ignored). These are viewport checks, not physical-device tests. The existing
Home Assistant source destination returns 404 to unauthenticated visitors;
its links are preserved. No new custom keyboard shortcuts or backend behavior.
