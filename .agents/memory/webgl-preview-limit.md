---
name: WebGL preview limitation
description: The hosted screenshot browser can lack WebGL 2 even when the app starts normally
---

The hosted app-preview browser can lack WebGL 2 even when the Next.js workflow is healthy; Three.js r186 needs WebGL 2 for its 3D scenes. Keep the 3D renderer for supported browsers, but give unsupported browsers an interactive, option-aware CSS/SVG preview instead of a blank or disabled scene. Label it as a lightweight generic preview, not a manufacturer-accurate render.

**Why:** The configurator should remain useful on phones and privacy-hardened browsers that cannot create WebGL2 contexts. A static placeholder loses the ability to inspect the selected design, while a clearly labelled 2D fallback stays interactive without claiming 3D accuracy.

**How to apply:** Preserve the capability check and real 3D path. When WebGL2 is unavailable, reflect the selected product family and visible options in the lightweight scene and keep its open/close interaction working. Test both the unsupported-device fallback and a WebGL2-capable browser; software-WebGL performance warnings alone are not runtime exceptions.