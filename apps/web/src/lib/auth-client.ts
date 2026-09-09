import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  fetchOptions: {
    onRequest(context) {
      if (typeof document !== 'undefined')
        context.headers.set('x-cat-care-locale', document.documentElement.lang);
    },
  },
});
