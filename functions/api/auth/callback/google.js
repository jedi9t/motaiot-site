// /functions/api/auth/callback/google.js

/**
 * Cloudflare Pages Functions 的入口点：处理 Google OAuth 回调
 * @param {object} context - 包含 request, env, params 的对象
 */
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.hugo_auth_db; // D1 数据库绑定
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // 清除 state cookie 的指令 (防止浏览器缓存，虽然我们不再依赖它)
    const clearStateCookie = 'google_oauth_state=; Max-Age=0; HttpOnly; Secure; Path=/';

    // 1. 验证 Code 和 State 是否缺失
    if (!code || !state) {
        return new Response('Missing code or state in callback', { status: 400 });
    }

    try {
        // --- 2. 验证 State (CSRF 保护) ---
        // 检查 D1 数据库中是否存在该 state 及其对应的临时会话
        const { results } = await db.prepare(
            `SELECT expires FROM sessions WHERE sessionId = ?1 AND userId = ?2`
        ).bind(state, 'GUEST_STATE').all(); // GUEST_STATE 是在 login.js 中设置的标记

        if (results.length === 0) {
             // State 不存在 (可能被使用过或从未设置)
            return new Response('State validation failed: State not found or missing.', { 
                status: 401,
                headers: { 'Set-Cookie': clearStateCookie }
            });
        }
        
        // 检查是否过期
        if (Date.now() > results[0].expires) {
            db.prepare(`DELETE FROM sessions WHERE sessionId = ?1`).bind(state).run();
            return new Response('State validation failed: State expired.', { 
                status: 401,
                headers: { 'Set-Cookie': clearStateCookie }
            });
        }

        // State 验证成功，立即从 D1 中删除，防止重放攻击
        db.prepare(`DELETE FROM sessions WHERE sessionId = ?1`).bind(state).run();


        // --- 3. 交换 Token ---
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
            // Token 交换失败：打印 Google 返回的详细错误
            const errorBody = await tokenResponse.text();
            console.error("Token exchange failed:", errorBody);
            return new Response(`Token exchange failed: ${errorBody}`, { status: 500 });
        }
        
        const { access_token } = await tokenResponse.json();

        // --- 4. 获取用户信息 ---
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
        
        if (!userEmail) {
             return new Response('OAuth provider did not return an email address.', { status: 400 });
        }

        // --- 5. D1 用户持久化 (Upsert) ---
        let userId;

        // 查找用户
        let existingUser = await db.prepare(`SELECT id FROM users WHERE email = ?1`)
            .bind(userEmail).first();

        if (existingUser) {
            userId = existingUser.id;
            // 更新用户信息
            await db.prepare(`UPDATE users SET name = ?1 WHERE id = ?2`)
                .bind(userName, userId).run();
        } else {
            // 创建新用户 (使用 UUID 作为 ID)
            const newId = crypto.randomUUID(); 
            await db.prepare(`INSERT INTO users (id, name, email) VALUES (?1, ?2, ?3)`)
                .bind(newId, userName, userEmail).run();
            userId = newId;
        }

        // --- 6. D1 创建持久会话 ---
        const sessionId = crypto.randomUUID(); 
        const maxAgeSeconds = 30 * 24 * 60 * 60; // 30 天
        const expires = Date.now() + (maxAgeSeconds * 1000); // 毫秒时间戳

        await db.prepare(`INSERT INTO sessions (sessionId, userId, expires) VALUES (?1, ?2, ?3)`)
            .bind(sessionId, userId, expires).run();

        // 7. 设置会话 Cookie
        const sessionCookie = `app_session_id=${sessionId}|${userId}; HttpOnly; Secure; Max-Age=${maxAgeSeconds}; Path=/`;
        
        // 8. 重定向到主页 (已登录)
        return new Response(null, {
            status: 302,
            headers: {
                'Location': 'https://motaiot.com/',
                // 设置两个 Cookie 头：清除 state 和设置 session
                'Set-Cookie': [clearStateCookie, sessionCookie], 
            }
        });

    } catch (e) {
        console.error("OAuth processing fatal error:", e);
        return new Response(`Internal Server Error during processing: ${e.message}`, { status: 500 });
    }
}