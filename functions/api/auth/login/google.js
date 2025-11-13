// /functions/api/auth/login/google.js

export async function onRequest(context) {
    const { env } = context;
    
    // 生成一个随机的 state 值以防止 CSRF 攻击
    const state = crypto.randomUUID(); 
    // 将 state 存入 Cookie，以便在回调时验证
    const stateCookie = `google_oauth_state=${state}; HttpOnly; Secure; Max-Age=3600; Path=/`;

    // 构造 Google OAuth 授权 URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', env.GOOGLE_ID);
    authUrl.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile'); // 请求 email 和 profile 权限
    authUrl.searchParams.set('state', state);
    
    // 重定向用户并设置 state cookie
    return Response.redirect(authUrl.toString(), 302, {
        'Set-Cookie': stateCookie
    });
}