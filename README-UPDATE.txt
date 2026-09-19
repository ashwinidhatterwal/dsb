DSB AI SPEED UPDATE

Overlay these files onto the current repository, preserving their paths:
- admin-ai.js
- src/backend/ai-product.gs

Then run:
  node scripts/build.mjs
  node scripts/check-ai.mjs
  node scripts/check-autofill.mjs
  node scripts/check-checkout.mjs
  node scripts/check.mjs

Commit the rebuilt root code.gs together with these two source files.
After GitHub is updated, copy the rebuilt root code.gs to Apps Script and deploy a NEW web-app version.

Optional Apps Script Script Properties:
AI_IMAGE_DETAIL=low   (default; use auto/high only when tiny labels need more detail)
AI_MAX_OUTPUT_TOKENS=1400
