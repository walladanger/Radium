#!/bin/bash
git checkout web-app/src/services/media/adapters/a1111.ts
git checkout web-app/src/services/media/adapters/falAi.ts
git checkout web-app/src/services/media/adapters/replicate.ts
git checkout web-app/src/services/media/adapters/stabilityAi.ts

# a1111.ts fixes
sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/a1111.ts
sed -i 's/ catch (_error) {/ catch {/g' web-app/src/services/media/adapters/a1111.ts
sed -i 's/async cancel(_handle: MediaJobHandle/async cancel(_handle: MediaJobHandle/g' web-app/src/services/media/adapters/a1111.ts

# Add missing properties to a1111 models
sed -i 's/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE, MEDIA_TASK.IMAGE_TO_IMAGE\],/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE, MEDIA_TASK.IMAGE_TO_IMAGE\], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [], [MEDIA_TASK.IMAGE_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" }, [MEDIA_TASK.IMAGE_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }/g' web-app/src/services/media/adapters/a1111.ts

# falAi.ts fixes
sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/falAi.ts
sed -i 's/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE\],/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE\], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }/g' web-app/src/services/media/adapters/falAi.ts
sed -i 's/tasks: \[MEDIA_TASK.TEXT_TO_VIDEO\],/tasks: \[MEDIA_TASK.TEXT_TO_VIDEO\], params: { [MEDIA_TASK.TEXT_TO_VIDEO]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_VIDEO]: { media_type: "video" } }, install: { installed: true, installable: false }/g' web-app/src/services/media/adapters/falAi.ts

# replicate.ts fixes
sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/replicate.ts
sed -i 's/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE\],/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE\], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }/g' web-app/src/services/media/adapters/replicate.ts
sed -i 's/tasks: \[MEDIA_TASK.TEXT_TO_VIDEO\],/tasks: \[MEDIA_TASK.TEXT_TO_VIDEO\], params: { [MEDIA_TASK.TEXT_TO_VIDEO]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_VIDEO]: { media_type: "video" } }, install: { installed: true, installable: false }/g' web-app/src/services/media/adapters/replicate.ts

# stabilityAi.ts fixes
sed -i 's/ catch (_e) {/ catch {/g' web-app/src/services/media/adapters/stabilityAi.ts
sed -i 's/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE\],/tasks: \[MEDIA_TASK.TEXT_TO_IMAGE\], params: { [MEDIA_TASK.TEXT_TO_IMAGE]: [] }, outputs: { [MEDIA_TASK.TEXT_TO_IMAGE]: { media_type: "image" } }, install: { installed: true, installable: false }/g' web-app/src/services/media/adapters/stabilityAi.ts
sed -i 's/body: formData as any/body: formData as unknown as BodyInit/g' web-app/src/services/media/adapters/stabilityAi.ts
