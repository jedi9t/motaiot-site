// /functions/api/auth/google/login.js (新增错误处理和日志)

export async function onRequest(context) {
    const { env } = context;
    const db = env.hugo_auth_db; // D1 绑定
    
    // 1. D1 数据准备
    const state = crypto.randomUUID(); 
    const sessionId = state; 
    const userId = 'GUEST_STATE'; 
    const maxAgeSeconds = 300; 
    const expires = Date.now() + (maxAgeSeconds * 1000); 

    try {
        // 2. 尝试将 State 写入 D1
        const result = await db.prepare(
            // 🚨 再次确认 SQL：使用实际的四列
            `INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?1, ?2, ?3, ?4)`
        ).bind(sessionId, userId, sessionId, expires).run();
        
        // 3. 调试日志：检查 D1 写入结果
        console.log('D1 State write result:', result); 
        
        // 4. 构造 Google OAuth URL (保持不变)
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', env.GOOGLE_ID);
        authUrl.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('state', state);

        // 5. 重定向用户
        return Response.redirect(authUrl.toString(), 302);

    } catch (e) {
        // 🚨 关键：捕获 D1 写入错误
        console.error('FATAL D1 WRITE ERROR in login.js:', e.message);
        
        // 返回 500 错误，并显示详细信息（仅用于调试）
        return new Response(`Login Failed: D1 Write Error. Check Cloudflare Worker logs. Details: ${e.message}`, { status: 500 });
    }
}