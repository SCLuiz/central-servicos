(function () {
    var token     = localStorage.getItem('oauth_access_token');
    var auth      = localStorage.getItem('isAuthenticated');
    var expiresAt = parseInt(localStorage.getItem('oauth_expires_at') || '0', 10);
    var valid     = auth === 'true' && token && expiresAt > Date.now();

    if (!valid) {
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('oauth_access_token');
        localStorage.removeItem('oauth_refresh_token');
        localStorage.removeItem('oauth_expires_at');
        localStorage.removeItem('oauth_cloud_id');
        localStorage.removeItem('userName');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userAvatar');

        var base = window.location.pathname.replace(/\/[^\/]*$/, '/');
        window.location.replace(base + 'login.html');
    }
})();
