# Arrow Pro 3D Agent Instructions

## Mission
Maintain Arrow Pro 3D as a single, device-agnostic 3D WebGL browser game. Work on browser/GPU capabilities, never on device-brand-specific behavior.

## Non-negotiable requirements

1. Treat every supported browser as a WebGL client.
2. Detect actual runtime rendering capabilities before selecting rendering settings.
3. Collect GPU/renderer information only where the browser exposes it; do not assume it exists.
4. Use capability-based adaptive 3D rendering profiles.
5. Preserve full 3D rendering on every supported platform. **Never add a 2D fallback.**
6. Keep Three.js/game logic platform-independent.
7. Support modern browsers across Android, iOS/iPadOS, Windows, macOS, and Linux without device-specific branches.
8. Do not hard-code assumptions about browser, GPU vendor, device model, screen size, or operating system.
9. Instrument telemetry for:
   - WebGL capability detection
   - context creation success/failure
   - renderer initialization success/failure
   - selected rendering profile
   - GPU/renderer identifiers when safely available
   - game startup
   - startup/runtime failures
10. The Cloudflare Worker is the delivery and telemetry layer. Preserve the existing playtest telemetry contract unless a change is required and documented.
11. Validate changes before deployment.
12. A change is not considered a WebGL fix merely because CI passes. Browser/device telemetry must be used when real hardware behavior is involved.

## Rendering policy

Use progressive capability detection. Prefer a robust WebGL context configuration, then select quality settings from measured capabilities. Adapt settings such as pixel ratio, shadow-map resolution/type, antialiasing, and other GPU-sensitive options without changing the game into a different rendering mode.

If WebGL cannot be created, report a clear 3D/WebGL failure and telemetry event. Do not silently switch to Canvas2D, DOM, 2D sprites, or another non-3D implementation.

## Validation policy

Before deployment:

- Run the existing browser test workflow.
- Verify the actual canvas has a working WebGL context.
- Verify the tower renders and remains interactive.
- Verify pointer/touch interaction and level progression.
- Verify no new console/page/request errors.
- Exercise more than one viewport/profile where practical.
- Review the diff for device-specific assumptions.

## Deployment policy

Do not deploy speculative WebGL changes directly to the public playtest. Prefer a branch/PR, pass validation, then deploy. Preserve the current known-good playtest endpoint until the replacement is validated.

## Scope

The target is one Arrow Pro 3D codebase with runtime capability adaptation. Do not create separate Android, iPhone, laptop, or desktop game implementations.
