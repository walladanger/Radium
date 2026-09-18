#!/bin/bash
git checkout web-app/src/services/media/adapters/a1111.ts
git checkout web-app/src/services/media/adapters/falAi.ts
git checkout web-app/src/services/media/adapters/replicate.ts
git checkout web-app/src/services/media/adapters/stabilityAi.ts

sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/a1111.ts
sed -i 's/ catch (_error) {/ catch {/g' web-app/src/services/media/adapters/a1111.ts
sed -i 's/async cancel(_handle: MediaJobHandle/async cancel(handle: MediaJobHandle/g' web-app/src/services/media/adapters/a1111.ts
sed -i '/async cancel/a \        void handle' web-app/src/services/media/adapters/a1111.ts

sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/falAi.ts
sed -i 's/async health(_signal/async health(signal/g' web-app/src/services/media/adapters/falAi.ts
sed -i '/async health/a \        void signal' web-app/src/services/media/adapters/falAi.ts
sed -i 's/async capabilities(_signal/async capabilities(signal/g' web-app/src/services/media/adapters/falAi.ts
sed -i '/async capabilities/a \        void signal' web-app/src/services/media/adapters/falAi.ts

sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/replicate.ts
sed -i 's/async capabilities(_signal/async capabilities(signal/g' web-app/src/services/media/adapters/replicate.ts
sed -i '/async capabilities/a \        void signal' web-app/src/services/media/adapters/replicate.ts

sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/stabilityAi.ts
sed -i 's/async health(_signal/async health(signal/g' web-app/src/services/media/adapters/stabilityAi.ts
sed -i '/async health/a \        void signal' web-app/src/services/media/adapters/stabilityAi.ts
sed -i 's/async capabilities(_signal/async capabilities(signal/g' web-app/src/services/media/adapters/stabilityAi.ts
sed -i '/async capabilities/a \        void signal' web-app/src/services/media/adapters/stabilityAi.ts
