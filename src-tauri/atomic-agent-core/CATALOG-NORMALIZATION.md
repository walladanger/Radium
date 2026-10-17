# Vendored BioNeMo identity audit

Source: Radium baseline d60f2408982f36171de9088d3cb68fae5aa1fc98, src-tauri/resources/agent-skills. The catalog README identifies NVIDIA/skills as its publisher. Eleven publisher name headers differ from their prefixed directory IDs. Vendored headers and bodies remain unchanged; the registry rejects these identities and displays the diagnostic instead of enabling an alias.

`mirrored_identity_mismatches_are_pinned_and_rejected` records the exact directory/name pairs below and verifies their runtime rejection. A changed mismatch set requires review. Curated entries must match their directory identities in `bundled_skills_follow_explicit_platform_metadata_policy`. Informational publisher metadata never grants native tool or script permissions.

| Publisher name (unchanged) | Radium directory (rejected identity) |
| --- | --- |
| kermt-add-cmim-pretrain | bionemo-kermt-add-cmim-pretrain |
| kermt-continue-pretrain | bionemo-kermt-continue-pretrain |
| kermt-embed | bionemo-kermt-embed |
| kermt-finetune | bionemo-kermt-finetune |
| kermt-infer | bionemo-kermt-infer |
| kermt-monitor | bionemo-kermt-monitor |
| kermt-pretrain-scratch | bionemo-kermt-pretrain-scratch |
| kermt-setup | bionemo-kermt-setup |
| msa-structure-prediction-pipeline | bionemo-msa-structure-prediction-pipeline |
| nvmolkit-usage | bionemo-nvmolkit-usage |
| openfold2-nim | bionemo-openfold2-nim |
