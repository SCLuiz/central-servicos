(function () {
    var token       = localStorage.getItem('oauth_access_token');
    var auth        = localStorage.getItem('isAuthenticated');
    var expiresAt   = parseInt(localStorage.getItem('oauth_expires_at')    || '0', 10);
    var validatedAt = parseInt(localStorage.getItem('auth_validated_at')   || '0', 10);
    var ONE_HOUR    = 60 * 60 * 1000;

    function clearAuth() {
        ['isAuthenticated','oauth_access_token','oauth_refresh_token',
         'oauth_expires_at','oauth_cloud_id','auth_validated_at',
         'userName','userEmail','userAvatar','authMethod'].forEach(function(k) {
            localStorage.removeItem(k);
        });
        var base = window.location.pathname.replace(/\/[^\/]*$/, '/');
        window.location.replace(base + 'login.html');
    }

    // 1. Sem token ou expirado → redireciona imediatamente
    if (auth !== 'true' || !token || expiresAt <= Date.now()) {
        clearAuth();
        return;
    }

    // 2. Validado há menos de 1 hora → libera sem chamar API
    if (validatedAt && (Date.now() - validatedAt) < ONE_HOUR) {
        return;
    }

    // 3. Precisa validar contra a Atlassian → esconde página até confirmar
    document.documentElement.style.visibility = 'hidden';

    // Timeout de segurança: se a API não responder em 10s, bloqueia (fail-closed)
    var validationTimeout = setTimeout(function () {
        console.warn('[auth-guard] Timeout na validação do token — bloqueando acesso (fail-closed)');
        clearAuth();
    }, 10000);

    fetch('https://api.atlassian.com/me', {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
    })
    .then(function (response) {
        clearTimeout(validationTimeout);
        if (response.ok) {
            localStorage.setItem('auth_validated_at', Date.now().toString());
            document.documentElement.style.visibility = '';
        } else {
            // Token inválido ou revogado → bloqueia (fail-closed)
            clearAuth();
        }
    })
    .catch(function (err) {
        clearTimeout(validationTimeout);
        // Falha de rede → fail-closed: bloqueia acesso por segurança
        // Isso evita que tokens revogados mantenham acesso em caso de indisponibilidade da API
        console.warn('[auth-guard] Falha de rede na validação do token — bloqueando acesso (fail-closed):', err);
        clearAuth();
    });
})();
