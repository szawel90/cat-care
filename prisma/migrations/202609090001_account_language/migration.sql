CREATE TYPE "LanguagePreference" AS ENUM ('system', 'en', 'pl');
ALTER TABLE "User" ADD COLUMN "languagePreference" "LanguagePreference" NOT NULL DEFAULT 'system';
