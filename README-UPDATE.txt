DSB AI EFFICIENCY + BACKEND BUILD FIX
=====================================

This package contains every file that needs to be replaced/added for this update.
It intentionally does NOT contain unrelated storefront files, so uploading it over
your current repository will not roll back other recent website changes.

WHAT THIS FIXES
- code.gs is freshly generated from src/backend/*.gs.
- GitHub Actions `node scripts/build.mjs --check` passes.
- AI provider/model remains configurable through Apps Script Script Properties.
- AI images use lightweight analysis copies when possible; storefront images remain unchanged.
- AI output is capped more efficiently.
- Chat-completions schema incompatibility is cached to avoid repeating a slow failed request.
- Only transient 429/502/503/504 provider failures retry once.
- Admin generation timeout is 75 seconds and progress is clearer.

UPLOAD
1. Extract this ZIP.
2. Upload/replace these files at the SAME paths in your GitHub repository.
3. Do not move files out of src/backend or scripts.
4. GitHub Actions should now pass the build consistency step.
5. Copy the NEW root code.gs into your Apps Script project.
6. Apps Script: Deploy > Manage deployments > Edit > New version > Deploy.

SCRIPT PROPERTIES
Required:
  AI_API_KEY
  AI_BASE_URL
  AI_MODEL
  AI_API_TYPE = responses  OR  chat_completions

Optional performance tuning:
  AI_IMAGE_DETAIL = low       (default; use high only when fine label/detail reading is needed)
  AI_MAX_OUTPUT_TOKENS = 1400 (default; accepted range is bounded in code)

Existing OPENAI_API_KEY / OPENAI_MODEL fallback remains supported.
Never put an API key in GitHub or browser JavaScript.

VERIFIED LOCALLY
- node scripts/build.mjs
- node scripts/build.mjs --check
- node scripts/check-ai.mjs
- node scripts/check-checkout.mjs
- node scripts/check.mjs
All passed before packaging.
