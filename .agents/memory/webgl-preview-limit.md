---
name: WebGL preview limitation
description: The hosted screenshot browser can lack WebGL 2 even when the app starts normally
---

On 2026-09-30, the app-preview screenshot browser returned no WebGL 2 context for the Doorlink configurator, so the existing capability fallback appeared. The Next.js workflow itself started successfully. Three.js r186 needs WebGL 2 for this scene.

**Why:** A no-context result from the screenshot browser is an environment limitation, not evidence that the scene code threw during rendering. Removing the fallback or substituting a static scene would hide the real constraint and violate the interactive configurator requirement.

**How to apply:** When app-preview shows the fallback, check the WebGL 2 probe and workflow logs. Verify the 3D scene in a WebGL 2-capable browser before diagnosing geometry or changing the capability gate.