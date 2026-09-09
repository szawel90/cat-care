# Component workbench

Storybook renders the same Cat Care components, CSS tokens and English/Polish catalogs as the application. Use it to inspect states and agree on component changes before checking the complete screen. It is a development tool and is not included in the Next.js application bundle.

## Run on demand

Run `pnpm storybook` from the repository root, then open http://127.0.0.1:6006. Stop it with Ctrl+C when finished. It is intentionally separate from `pnpm dev`; no API, Docker database or real sign-in is needed. Do not keep another workbench running in the background.

Use the toolbar to choose Light, Dark or System, English or Polski, and a phone, narrow phone, tablet or desktop viewport. Stories with fixed globals, such as PolishDark, keep their named scenario; use an ordinary story to explore the toolbar. The Controls panel edits the selected component's supported state. Documentation renders stories in separate frames so their themes and portal content stay isolated.

The initial catalog covers buttons, account feedback, email/password fields, settings tabs, the account menu and unsaved-change confirmation. Feedback, fields and the settings tab shell are shared with the real account screen. Menu callbacks are spies, navigation is intercepted or mocked, and form examples use synthetic values.

## Add a scenario

Add a `*.stories.tsx` file under `apps/web/src/stories`. Import the production component rather than copying its markup. Reuse existing styles and complete messages. Put only workbench frame styles in `.storybook/preview.css`.

Include relevant success, error, disabled, loading and long-content states. Add a meaningful `play` function for behavior such as keyboard activation, focus return, password visibility or a callback. Use synthetic data and controlled dependencies. Never call the real account API or include secrets, owner data or private research. Async server rendering and authentication remain covered by application integration and E2E tests.

## Checks

Run `pnpm typecheck:storybook`, `pnpm build:storybook` and `pnpm test:components`. The tests use Vitest with Playwright Chromium at desktop and mobile viewports, one worker with reduced motion. Install the browser once with `pnpm exec playwright install chromium` if needed. GitHub Actions also runs these checks alongside the existing application checks.

The accessibility addon explicitly checks available WCAG 2.0, 2.1 and 2.2 AA rules and fails the component test on violations. Keep keyboard assertions and complete-screen accessibility checks; automated checks do not establish full conformance. New accessibility tradeoffs still need review.

Stories and interaction tests do not automatically compare pixels. Screenshot regression baselines are a separate optional layer and should be generated and reviewed in a consistent rendering environment. No paid visual-testing service or public Storybook hosting is configured.

## Versions and licensing

Storybook 10.6.0 uses the recommended nextjs-vite framework with Vite 8.2.2. Its test addon supports Vitest 4, so Vitest and the browser packages are pinned to 4.1.11 rather than the incompatible latest major. Playwright matches the existing 1.63.0 application tests. Keep related Storybook packages and related Vitest packages on matching versions and review compatibility before updating.

Storybook is MIT licensed; its notice is in `docs/licenses/storybook.txt`. Telemetry is disabled. Generated `storybook-static` output is ignored. Configuration and stories are development dependencies and source files, not production routes.
