import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Regenerates the README screenshots in docs/images (`npm run screenshots`). */
export default defineConfig({ ...base, testIgnore: [], testMatch: '**/screenshots.spec.ts', fullyParallel: false, retries: 0 });
