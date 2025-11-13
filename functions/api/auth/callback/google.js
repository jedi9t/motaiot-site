// /functions/api/auth/callback/google.js

/**
 * 辅助函数：从 Cookie 字符串中解析键值对
 * @param {string} cookieHeader - 请求头中的 Cookie 字符串
 * @returns {Map<string, string>} - 包含所有 Cookie 的 Map
 */
function parseCookies(cookieHeader) {
    const cookieMap = new Map();
    if (!cookieHeader) return cookieMap;

    cookieHeader.split(';').forEach(cookie => {
        // 使用第一个 '=' 分割，并去除空白
        const parts = cookie.trim().split('=', 2);
        if (parts.length === 2) {
            cookieMap.set(parts[0], parts[1]);
        }
    });
    return cookieMap;
}

/**
 * Cloudflare Pages Functions 的入口点：处理 Google OAuth 回调
 * @param {object} context - 包含 request, env, params 的对象
 */
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // 1. 验证 Code 和 State
    if (!code || !state) {
        return new Response('Missing code or state in callback', { status: 400 });
    }

    const cookieMap = parseCookies(request.headers.get('Cookie'));
    const stateCookie = cookieMap.get('google_oauth_state');
    
    // 清除 state cookie 的指令
    const clearStateCookie = 'google_oauth_state=; Max-Age=0; HttpOnly; Secure; Path=/';

    // 关键步骤：验证 State (CSRF 保护)
    if (!stateCookie || state !== stateCookie) {
        return new Response('State mismatch or missing state cookie', { 
            status: 401,
            headers: { 'Set-Cookie': clearStateCookie }
        });
    }

    try {
        // 2. 交换 Token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: env.GOOGLE_ID,
                client_secret: env.GOOGLE_SECRET,
                code,
                // ⚠️ 这里的 redirect_uri 必须与您的 Google 控制台设置的 URI 严格匹配
                redirect_uri: 'https://motaiot.com/api/auth/callback/google',
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            console.error("Token exchange failed:", await tokenResponse.text());
            return new Response('Token exchange failed', { status: 500 });
        }
        
        const { access_token } = await tokenResponse.json();

        // 3. 获取用户信息
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

        // --- 4. D1 用户持久化 (Upsert) ---
        const db = env.hugo_auth_db;
        let userId;

        // 检查用户是否存在 (通过 email)
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

        // --- 5. D1 会话创建 ---
        const sessionId = crypto.randomUUID(); 
        const maxAgeSeconds = 30 * 24 * 60 * 60; // 30 天
        const expires = Date.now() + (maxAgeSeconds * 1000); // 毫秒时间戳

        await db.prepare(`INSERT INTO sessions (sessionId, userId, expires) VALUES (?1, ?2, ?3)`)
            .bind(sessionId, userId, expires).run();

        // 6. 设置会话 Cookie (app_session_id=sessionId|userId)
        const sessionCookie = `app_session_id=${sessionId}|${userId}; HttpOnly; Secure; Max-Age=${maxAgeSeconds}; Path=/`;
        
        // 7. 重定向到主页 (已登录)
        return new Response(null, {
            status: 302,
            headers: {
                'Location': 'https://motaiot.com/',
                // 设置两个 Cookie 头：清除 state 和设置 session
                'Set-Cookie': [clearStateCookie, sessionCookie], 
            }
        });

    } catch (e) {
        console.error("OAuth processing error:", e);
        return new Response(`Internal Server Error: ${e.message}`, { status: 500 });
    }
}