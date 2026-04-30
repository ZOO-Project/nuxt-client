export default defineNuxtPlugin(async () => {
    const headers = useRequestHeaders(['cookie']);
    const { status, data, getSession } = useAuth();
    const authStore = useAuthStore();

    // Force un fetch de session côté client pour initialiser l'état
    if (process.client) {
        try {
            console.debug('[auth-plugin] forcing client getSession');
            const session = await getSession();
            console.debug('[auth-plugin] getSession result', session);
            if (session?.user) {
                authStore.setUser(session.user);
                authStore.isAuthenticated = true;
            }
        } catch (err) {
            console.debug('[auth-plugin] getSession failed', err);
        }
    }

    try {
        console.debug('[auth-plugin] status', status.value, 'user', authStore.user);
        if (status.value === 'authenticated' || authStore.user) {
            authStore.isAuthenticated = true;

            const { data: token, error } = await useFetch('/api/token', { headers });
            console.debug('[auth-plugin] token response', { hasToken: !!token.value, hasError: !!error.value });

            if (token.value) {
                authStore.setToken(token.value);
                authStore.setUser(data.value?.user || authStore.user);
            } else if (error.value) {
                // Session invalide ou détruite, on ignore silencieusement
                authStore.clearAuth();
            }
        }
    } catch (error) {
        // Ignore les erreurs de session après logout
        console.debug('Auth plugin: session unavailable', error);
        authStore.clearAuth();
    }
});
