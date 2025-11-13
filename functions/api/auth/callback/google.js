// /functions/api/auth/callback/google.js

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // 1. 验证 State (CSRF 保护)
    const stateCookie = request.headers.get('Cookie')?.match(/google_oauth_state=([^;]+)/)?.[1];
    if (!state || state !== stateCookie) {
        return new Response('State mismatch or missing state cookie', { status: 401 });
    }

    // 2. 交换 Token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.GOOGLE_ID,
            client_secret: env.GOOGLE_SECRET,
            code,
            redirect_uri: 'https://motaiot.com/api/auth/callback/google',
            grant_type: 'authorization_code',
        }),
    });
    const { access_token, id_token } = await tokenResponse.json();

    // 3. 获取用户信息
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const profile = await userResponse.json();
    
    // 4. 用户持久化（取代 D1 适配器）
    // ⚠️ 假设您已在 D1 中实现了 getUserById 和 upsertUser 函数
    // 4. 用户持久化（取代 D1 适配器）
    const db = context.env.hugo_auth_db;
    const existingUser = await db.prepare(`SELECT id FROM users WHERE email = ?1`).bind(profile.email).first();
    let userId;

    if (existingUser) {
        userId = existingUser.id;
        // 可选：更新用户信息
        await db.prepare(`UPDATE users SET name = ?1 WHERE id = ?2`)
            .bind(profile.name, userId).run();
    } else {
        // 创建新用户 (假设 id 为 UUID 或自增)
        const newId = crypto.randomUUID(); 
        await db.prepare(`INSERT INTO users (id, name, email) VALUES (?1, ?2, ?3)`)
            .bind(newId, profile.name, profile.email).run();
        userId = newId;
    }

    // 创建会话
    const sessionId = crypto.randomUUID(); 
    const expires = Date.now() + 2592000000; // 30 天 (毫秒)
    await db.prepare(`INSERT INTO sessions (sessionId, userId, expires) VALUES (?1, ?2, ?3)`)
        .bind(sessionId, userId, expires).run();

    // 5. 设置会话 Cookie (JWT)
    // 实际应用中，您应该生成一个 JWT，这里简化为设置用户 ID
    // const sessionId = crypto.randomUUID(); 
    const sessionCookie = `app_session_id=${sessionId}|${userId}; HttpOnly; Secure; Max-Age=3600; Path=/`;

    // 6. 重定向到主页 (已登录)
    return Response.redirect('https://motaiot.com/', 302, {
        'Set-Cookie': sessionCookie
    });
}