// /functions/api/auth/callback/google.js (修正了 sessions 表的列名)

// 辅助函数：从 Cookie 字符串中解析键值对 (保持不变)
function parseCookies(cookieHeader) {
    const cookieMap = new Map();
    if (!cookieHeader) return cookieMap;

    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.trim().split('=', 2);
        if (parts.length === 2) {
            cookieMap.set(parts[0], parts[1]);
        }
    });
    return cookieMap;
}

/**
 * Cloudflare Pages Functions 的入口点：处理 Google OAuth 回调
 */
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.hugo_auth_db; 
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    const clearStateCookie = 'google_oauth_state=; Max-Age=0; HttpOnly; Secure; Path=/';

    if (!code || !state) {
        return new Response('Missing code or state in callback', { status: 400 });
    }

    try {
        // --- 1. 验证 State (CSRF 保护) ---
        // 查找 D1 中的临时会话 (仍然使用 state 作为 sessionId 的值进行查询)
        const { results } = await db.prepare(
            // 假设 sessions 表的 PRIMARY KEY 是 id，存储了 state
            `SELECT expires FROM sessions WHERE id = ?1 AND userId = ?2` 
        ).bind(state, 'GUEST_STATE').all(); 

        if (results.length === 0 || Date.now() > results[0].expires) {
            db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(state).run();
            return new Response('State validation failed: State not found or expired.', { 
                status: 401,
                headers: { 'Set-Cookie': clearStateCookie }
            });
        }
        // State 验证成功，立即从 D1 中删除，防止重放攻击
        db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(state).run();


        // --- 2. 交换 Token (保持不变) ---
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

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            console.error("Token exchange failed:", errorBody);
            return new Response(`Token exchange failed: ${errorBody}`, { status: 500 });
        }
        
        const { access_token } = await tokenResponse.json();

        // --- 3. 获取用户信息 (保持不变) ---
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        if (!userResponse.ok) {
            console.error("User info fetch failed:", await userResponse.text());
            return new Response('User info fetch failed', { status: 500 });
        }
        
        const profile = await userResponse.json();
        const userEmail = profile.email;
        const userName = profile.name || userEmail;
        
        // --- 4. D1 用户持久化 (Upsert) (保持不变) ---
        let userId;
        let existingUser = await db.prepare(`SELECT id FROM users WHERE email = ?1`)
            .bind(userEmail).first();

        if (existingUser) {
            userId = existingUser.id;
            await db.prepare(`UPDATE users SET name = ?1 WHERE id = ?2`)
                .bind(userName, userId).run();
        } else {
            const newId = crypto.randomUUID(); 
            await db.prepare(`INSERT INTO users (id, name, email) VALUES (?1, ?2, ?3)`)
                .bind(newId, userName, userEmail).run();
            userId = newId;
        }

        // --- 5. D1 创建持久会话 (修正 SQL) ---
        const sessionId = crypto.randomUUID(); 
        const maxAgeSeconds = 30 * 24 * 60 * 60; 
        const expires = Date.now() + (maxAgeSeconds * 1000); 

        // 🚨 修正 SQL：使用实际的列名 id, sessionToken, expires
        await db.prepare(`INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?1, ?2, ?3, ?4)`)
            .bind(sessionId, userId, sessionId, expires).run();


        // --- 6. 设置会话 Cookie ---
        const sessionCookie = `app_session_id=${sessionId}|${userId}; HttpOnly; Secure; Max-Age=${maxAgeSeconds}; Path=/`;
        
        // 7. 重定向到主页 (已登录)
        return new Response(null, {
            status: 302,
            headers: {
                'Location': 'https://motaiot.com/',
                'Set-Cookie': [clearStateCookie, sessionCookie], 
            }
        });

    } catch (e) {
        console.error("OAuth processing fatal error:", e);
        // 打印一个更清晰的错误响应，包含详细信息
        return new Response(`Internal Server Error during processing: ${e.message}. See Cloudflare Logs.`, { status: 500 });
    }
}