// /functions/api/auth/google/login.js (修正 D1 写入，确保写入完成)

export async function onRequest(context) {
    const { env } = context;
    const state = crypto.randomUUID(); 
    const db = env.hugo_auth_db;

    // 1. D1 数据库写入 State
    const sessionId = state; 
    const userId = 'GUEST_STATE'; 
    const maxAgeSeconds = 300; // 5 分钟
    const expires = Date.now() + (maxAgeSeconds * 1000); 

    // 🚨 关键修正：使用 .run() 并使用 await 等待写入完成
    // 确保 D1 写入完成，否则 state 在回调时找不到
    await env.hugo_auth_db.prepare(
    // 使用明确的问号绑定符
    `INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?, ?, ?, ?)`
    ).bind(state, 'GUEST_STATE', state, expires).run(); // 确保使用了 await .run()
    

    // 2. 构造 Google OAuth 授权 URL (保持不变)
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', env.GOOGLE_ID);
    authUrl.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);

    // 3. 重定向用户 (无需设置 Set-Cookie)
    return Response.redirect(authUrl.toString(), 302);
}