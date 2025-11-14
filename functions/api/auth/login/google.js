// /functions/api/auth/login/google.js (使用 KV 存储 State)

export async function onRequest(context) {
    const { env } = context;
    // D1 不再用于临时 State 存储
    // const db = env.hugo_auth_db; 

    // 1. State 数据准备
    const state = crypto.randomUUID(); 
    const STATE_TTL_SECONDS = 300; // 5分钟有效期

    try {
        // 2. 关键：将 State 写入 KV，使用 TTL
        // 变量名 OAUTH_STATE_KV 必须与 Pages 绑定名称一致
        await env.OAUTH_STATE_KV.put(
            state,  // Key: State UUID
            'valid', // Value: 任意值，表示有效
            { expirationTtl: STATE_TTL_SECONDS } // TTL 自动处理过期
        );
        
        console.log('KV State written successfully. State ID:', state); 
        
        // 3. 构造 Google OAuth 授权 URL
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', env.GOOGLE_ID);
        authUrl.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('state', state);

        // 4. 重定向用户
        return Response.redirect(authUrl.toString(), 302);

    } catch (e) {
        console.error('FATAL ERROR in login.js:', e.message);
        return new Response(`Login Failed: Error. Details: ${e.message}`, { status: 500 });
    }
}