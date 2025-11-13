// /functions/api/auth/google/login.js (修正后)

export async function onRequest(context) {
    const { env } = context;    
    const state = crypto.randomUUID(); 
    const db = env.hugo_auth_db;
    
    // 1. 将 state 及其过期时间存入 D1 数据库 (使用 sessions 表的结构)
    const sessionId = state; // 将 state 作为 sessionId
    const userId = 'GUEST_STATE'; // 标记为临时会话
    const maxAgeSeconds = 300; // 5 分钟
    const expires = Date.now() + (maxAgeSeconds * 1000); 

    await db.prepare(
        `INSERT INTO sessions (sessionId, userId, expires) VALUES (?1, ?2, ?3)`
    ).bind(sessionId, userId, expires).run();

    // 2. 构造 Google OAuth 授权 URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', env.GOOGLE_ID);
    authParams.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state); // state 仍然通过 URL 传递

    // 3. 重定向用户 (无需设置 Set-Cookie)
    return Response.redirect(authUrl.toString(), 302);
}
// /functions/api/auth/google/login.js

// export async function onRequest(context) {
//     const { env } = context;
    
//     // 生成一个随机的 state 值以防止 CSRF 攻击
//     const state = crypto.randomUUID(); 
//     // 将 state 存入 Cookie，以便在回调时验证
//     const stateCookie = `google_oauth_state=${state}; HttpOnly; Secure; Max-Age=3600; Path=/`;

//     // 构造 Google OAuth 授权 URL
//     const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
//     authUrl.searchParams.set('client_id', env.GOOGLE_ID);
//     authUrl.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
//     authUrl.searchParams.set('response_type', 'code');
//     authUrl.searchParams.set('scope', 'openid email profile'); // 请求 email 和 profile 权限
//     authUrl.searchParams.set('state', state);
    
//     // 重定向用户并设置 state cookie
//     return Response.redirect(authUrl.toString(), 302, {
//         'Set-Cookie': stateCookie
//     });
// }