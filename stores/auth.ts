// stores/auth.ts

import { defineStore } from 'pinia';
// import { useRuntimeConfig } from '#imports';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    isAuthenticated: false,
    token: null as null | any,
    user: null as null | any,
    /** True when a previous session could not be refreshed: the user must sign in again. */
    sessionExpired: false,
  }),
  actions: {
    setToken(token: any) {
      this.isAuthenticated = true;
      this.sessionExpired = false;
      this.token = token;
    },
    setUser(user: any) {
      this.isAuthenticated = true;
      this.user = user;
    },
    clearAuth() {
      this.isAuthenticated = false;
      this.token = null;
      this.user = null;
    },
    /** The access token is no longer accepted and could not be refreshed. */
    markExpired() {
      this.clearAuth();
      this.sessionExpired = true;
    },
  },
});