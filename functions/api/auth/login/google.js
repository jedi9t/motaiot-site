// /functions/api/auth/login/google.js

export async function onRequest(context) {
    const { env } = context;
    const db = env.hugo_auth_db; 

    // 1. D1 数据准备
    const state = crypto.randomUUID(); 
    const sessionId = state; // 使用 state 作为 ID
    const userId = 'GUEST_STATE'; // 标记为临时会话
    const maxAgeSeconds = 300; // 5 分钟有效期
    const expires = Date.now() + (maxAgeSeconds * 1000); 

    try {
        // 2. 尝试将 State 写入 D1，并强制检查结果
        // SQL 语句修正：使用实际的四列 (id, userId, sessionToken, expires)
        const result = await db.prepare(
            `INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?1, ?2, ?3, ?4)`
        ).bind(
            sessionId, 
            userId, 
            sessionId, 
            expires
        ).run();
        
        // 3. 关键检查：如果 D1 返回失败，则抛出异常
        if (result.success === false) {
            // 抛出异常，让 catch 块捕获 D1 错误详情
            throw new Error(`D1 INSERT FAILED: ${result.error || 'Unknown SQL error.'}`);
        }
        
        // 调试日志：如果写入成功，打印 State ID
        console.log('D1 State written successfully. State ID:', sessionId); 
        
        // 4. 构造 Google OAuth 授权 URL
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', env.GOOGLE_ID);
        authUrl.searchParams.set('redirect_uri', 'https://motaiot.com/api/auth/callback/google');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('state', state);

        // 5. 重定向用户
        return Response.redirect(authUrl.toString(), 302);

    } catch (e) {
        // 捕获所有错误 (包括 D1 错误和 JS 错误)
        console.error('FATAL ERROR in login.js:', e.message);
        
        // 返回 500 错误，并显示详细信息（仅用于调试）
        return new Response(`Login Failed: D1 Error. Details: ${e.message}`, { status: 500 });
    }
}