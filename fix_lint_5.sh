#!/bin/bash
sed -i 's/import { isDataUrl } from '"'"'..\/assets'"'"'/import { isDataUrl } from '"'"'..\/assets.js'"'"'/g' web-app/src/services/media/adapters/a1111.ts
