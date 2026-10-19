---
date: 2026-10-16
title: Scope checksum grammar scanner exception to legacy names
---

# Scope checksum grammar scanner exception to legacy names

- **Context:** Extracting the existing tool grammar into the shared agent core
  caused DevSkim DS126858 to flag two algorithm-name literals on one grammar
  declaration. That declaration specifies accepted file-checksum arguments; it
  does not perform cryptography. The native filesystem executor already offers
  these explicit compatibility choices and defaults to SHA-256.
- **Decision:** Preserve the accepted grammar and document a suppression of
  DS126858 on that exact declaration. Keep the rule enabled everywhere else.
  No algorithm, default, authorization check or executable hash operation is
  changed by this exception.
- **Consequences:** Existing file-checksum requests remain compatible. The
  legacy algorithms remain unsuitable for adversarial integrity or security
  decisions; this exception provides no approval for using them in those roles.
- **Owner:** team.
- **Links:** [Rule guidance](https://github.com/microsoft/DevSkim/blob/main/guidance/DS126858.md),
  [suppression syntax](https://github.com/microsoft/DevSkim/wiki/Suppressions).
