---
name: mission-control-design
description: Use this skill to generate well-branded interfaces and assets for Mission Control, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available
files. The README contains the visual contract; `colors_and_type.css`
contains every token; `ui_kits/mission-control/` contains React
recreations of the three primary surfaces (Board, Task Detail, Library).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.),
copy assets out and create static HTML files for the user to view. Link
`colors_and_type.css` and stay inside the locked palette: chrome is
grayscale, state is the only saturated color, project identity is one of
ten accent swatches.

If working on production code, you can copy assets and read the rules in
README.md to become an expert in designing with this brand. The repo
itself (`MikeTreml/MissionControl`) is the source of truth — re-import
from it when in doubt.

If the user invokes this skill without any other guidance, ask them what
they want to build or design, ask some questions (audience, surface,
voice, screens), and act as an expert designer who outputs HTML artifacts
*or* production code, depending on the need.
