CREATE TYPE "ThemePreference" AS ENUM ('system', 'light', 'dark');
ALTER TABLE "User" ADD COLUMN "themePreference" "ThemePreference" NOT NULL DEFAULT 'system';
