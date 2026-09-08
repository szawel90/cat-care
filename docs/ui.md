# Interface components

The web uses shadcn/ui components built on Radix UI, with Tailwind CSS and the Cat Care theme in apps/web/src/app/ui.css. CSS Grid arranges page regions; Flexbox aligns controls. Shared controls live in apps/web/src/components/ui and can be adapted in this repository.

Tailwind Preflight is omitted during migration so the existing screens retain their styles. The reset for new components is scoped to data-slot elements. Use the shared semantic theme tokens and the local cn utility rather than introducing a second palette or class merger.

The shadcn CLI is pinned as a development dependency. Preview registry updates and review the diff before replacing customized components. The copied components retain their MIT license in docs/licenses/shadcn-ui.txt; dependency licenses remain applicable.

Account settings open from the account menu and use Profile, Security and Data & privacy tabs. Tabs use manual keyboard activation to avoid discarding an edited form when arrowing through labels. Navigation within settings and sign-out check for unsaved changes.

Target WCAG 2.2 AA; test complete flows, keyboard operation, contrast and responsive behavior. Automated checks alone do not establish conformance. New accessibility tradeoffs require product-owner consultation before implementation and must be documented accurately.

Use Lucide for interface icons, with visible labels for navigation and ambiguous actions. Preserve the notices in docs/licenses/lucide.txt. The cat logo and official provider marks are separate assets.

The logo links to the public home page at / for both guests and signed-in users. Home contains three static sample article panels with Lorem ipsum and existing cat artwork; article management is a future module. The profile name above Settings links directly to /account. The account menu is shared between home and account screens.

Appearance uses Tailwind CSS 4 and native CSS, without Sass/SCSS. Semantic colors for the Quiet Companion light and dark themes live in apps/web/src/app/themes.css. Keep colors in these tokens rather than scattering literal values across controls.

Settings > Profile > Appearance offers System (the default), Light and Dark. The database stores the selected preference per user, never the currently resolved system color. Explicit choices override the device until the user chooses System again. The native prefers-color-scheme query follows live OS/browser changes and applies before JavaScript loads.

The server reads the signed-in user's preference without caching before rendering. Successful changes apply immediately and persist across devices; failed saves report an error and retain the previously confirmed choice. Preferences refresh on focus or when returning to a visible tab. Signing out restores System. No theme preference is copied to shared browser storage. Preference writes require current pilot access and an exact trusted Origin, and the preference is included in account export.

The palette uses IBM Carbon Gray and Blue scales with Cat Care role assignments: white / Gray 100 page backgrounds, neutral text, Blue 60 links in light mode and Blue 40 in dark mode. Primary buttons use white on Blue 60 (light) and Gray 100 on Blue 40 (dark). Raised dark surfaces become lighter. The existing SVG cat identity and PWA icons follow the blue palette. Color values are tokens, not independent literals per screen. See https://carbondesignsystem.com/elements/color/overview/ and https://carbondesignsystem.com/elements/color/tokens/.

The interface supports English and Polish through next-intl 4.14.2 (MIT; notice in docs/licenses/next-intl.txt). Code, identifiers and development documentation remain English. Settings > Profile > Language offers Automatic / English / Polski. Automatic matches supported browser languages and falls back to English. Explicit account choices persist in the database, independently of the theme. Guests can choose a language before signing in; their preference uses a separate HTTP-only cookie. Account choices never overwrite the guest cookie. After sign-out, the guest setting applies again.

Pages retain their existing URLs. Server rendering resolves the language before sending HTML; the client updates labels and refreshes server content after confirmed changes while preserving unsaved forms. Catalogs live in apps/web/messages; add both translations with each feature and check completeness in browser tests. Translate full messages, accessibility names, statuses and known account errors; keep technical API codes in English. Format session timestamps using next-intl and the browser time zone.

Account verification, password reset, email-change approval and deletion emails support both languages. A saved account language takes precedence; Automatic uses the validated interface-language hint supplied with the request, with English as fallback. Articles remain static examples with localized headings and intentional Lorem ipsum placeholders. Article management and localized article URLs are future work.
