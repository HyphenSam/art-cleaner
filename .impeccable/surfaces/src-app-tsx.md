---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

Scope: the whole app (single page, src/App.tsx). Mode: Operate.

Audience and job: collectors and archivists clean batches of saved art; drop images, keep defaults, process, check the result at pixel level, download each or all as a zip.

Constraints: plain, quiet voice with British spelling; nothing uploaded; credits always reachable; works offline; light and dark follow the system.

Reference bar: Upscayl (chosen by the user), at a higher finish.

## Direction contract

THESIS: The category standard played straight and finished properly: a settings column with numbered steps beside a neutral image stage. It refuses gradients, glass, glowing AI chrome and marketing copy inside the tool.

OWN-WORLD: Zinc neutrals in OKLCH with one indigo accent reserved for the primary action, selection, focus and progress. Hairline borders, 8 px control radius, 12 px panel radius. System UI font with tabular figures. The stage is a quiet grey (checkerboard only under transparency). Lucide icons at 1.75 stroke. Light and dark both first-class.

STORY: The visitor understands at once that images stay on their device, adds a batch, keeps the defaults, presses Clean, watches each image's progress, compares before and after, and downloads.

FIRST VIEWPORT: Desktop: a 320 px left column (name, three numbered sections Images / Steps / Output, the primary "Clean" button pinned at its foot with the device line under it); the stage fills the rest. Empty, the stage is one large drop target with "Drop images here", a Browse button and a paste hint. With images: the compare view fills the stage, its mode switch and zoom on a floating bar, the batch as a thumbnail strip along the bottom. Mobile: the stage first, the strip, then the settings, with the Clean button sticky at the bottom.

FORM: Category standard (canon), seed 9f93c025. Signature interaction: the compare slider with shared wheel zoom and drag pan, and per-image progress drawn on the thumbnail itself. Motion: 150–200 ms state transitions only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
