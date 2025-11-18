// /functions/api/auth/callback/google.js (完整且修正后的代码)

/**
 * 辅助函数：从 Cookie 字符串中解析键值对
 * (用于读取 login.js 设置的 state cookie，但在 KV 方案中已不再使用)
 * @param {string} cookieHeader - 请求头中的 Cookie 字符串
 * @returns {Map<string, string>} - 包含所有 Cookie 的 Map
 */
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
    const kv = env.OAUTH_STATE_KV;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
        return new Response('Missing code or state in callback.', { status: 400 });
    }

    // 清除 state cookie 的指令 (防止浏览器缓存)
    const clearStateCookie = 'google_oauth_state=; Max-Age=0; HttpOnly; Secure; Path=/; SameSite=Lax';

    try {
        // --- 1. State 验证和删除 (使用 KV) ---
        const stateValue = await kv.get(state);

        if (!stateValue) {
            console.error(`State validation failed: State ID ${state} not found or expired.`);
            return new Response('State not found or expired.', { 
                status: 401,
                headers: { 'Set-Cookie': clearStateCookie }
            });
        }
        
        // 验证成功后，立即删除 KV 记录（防止重放攻击）
        await kv.delete(state);

        // --- 2. Code 换取 Tokens ---
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: env.GOOGLE_ID,
                client_secret: env.GOOGLE_SECRET,
                redirect_uri: 'https://motaiot.com/api/auth/callback/google',
                grant_type: 'authorization_code',
            }).toString(),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Google Token Exchange Failed:', errorText);
            return new Response(`Token exchange failed: ${errorText}`, { status: 400 });
        }
        
        const tokens = await tokenResponse.json();
        const accessToken = tokens.access_token;

        // --- 3. Fetch User Info ---
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('User info fetch failed:', errorText);
            return new Response(`User info fetch failed: ${errorText}`, { status: 400 });
        }
        
        const profile = await userResponse.json();
        const userEmail = profile.email;
        const userName = profile.name || userEmail;
        const userAvatar = profile.picture || null;       
        
        if (!userEmail) {
             return new Response('OAuth provider did not return an email address.', { status: 400 });
        }

        // --- 4. D1 用户持久化 (Upsert) ---
        let userId;
        const providerAccountId = profile.sub;
        const newUserUUID = crypto.randomUUID();

        // 查找或创建用户 (users 表)
        let { results: userCheck } = await db.prepare(`SELECT id FROM users WHERE email = ?1`).bind(userEmail).all();
        
        if (userCheck.length > 0) {            
            userId = userCheck[0].id;
            await db.prepare(
                `UPDATE users SET name = ?1, avatar = ?2 WHERE id = ?3`
            ).bind(userName, userAvatar, userId).run();
            console.log('Existing user profile updated:', userId);
        } else {
            // [MODIFIED] 创建新用户，包含 name, email, 和 avatar
            userId = newUserUUID; 
            await db.prepare(
                `INSERT INTO users (id, name, email, emailVerified, avatar) VALUES (?1, ?2, ?3, ?4, ?5)`
            ).bind(userId, userName, userEmail, Date.now(), userAvatar).run();
            console.log('New user created:', userId);
        }

        // 查找或创建账户链接 (accounts 表)
        let { results: accountCheck } = await db.prepare(`
            SELECT userId FROM accounts WHERE provider = 'google' AND providerAccountId = ?1
        `).bind(providerAccountId).all();
        
        if (accountCheck.length === 0) {
            // 创建新的账户链接
            await db.prepare(`
                INSERT INTO accounts (id, userId, type, provider, providerAccountId, access_token, expires_at, id_token) 
                VALUES (?1, ?2, 'oauth', 'google', ?3, ?4, ?5, ?6)
            `).bind(
                crypto.randomUUID(), 
                userId, 
                providerAccountId, 
                accessToken, 
                tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null, 
                tokens.id_token
            ).run();
            console.log('New account link created for user:', userId);
        }

        // --- 5. 创建最终会话 (sessions 表) ---
        const sessionToken = crypto.randomUUID();
        const maxAgeSeconds = 30 * 24 * 60 * 60; // 30 天
        const sessionExpires = Date.now() + (maxAgeSeconds * 1000); 

        await db.prepare(
            `INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?1, ?2, ?3, ?4)`
        ).bind(
            sessionToken, 
            userId, 
            sessionToken, 
            sessionExpires
        ).run();
        
        // --- 6. 设置 Session Cookie 并重定向 (解决 Immutable Headers 错误) ---
        
        // 设置 Session Cookie 参数
        const cookieValue = `${sessionToken}|${userId}`;
        const cookieOptions = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
        
        const headers = new Headers();
        
        // 关键：Append 设置 Session Cookie
        headers.append('Set-Cookie', `__session=${cookieValue}; ${cookieOptions}`); 
        // 关键：Append 清除 State Cookie
        headers.append('Set-Cookie', `${clearStateCookie}`); 
        
        // 设置重定向 Location
        headers.set('Location', 'https://motaiot.com/');

        console.log(`Login successful for user ${userId}. Session token set.`);
        
        // 返回最终的 Response 对象
        return new Response(null, {
            status: 302,
            headers: headers
        });

    } catch (e) {
        // 捕获所有错误
        console.error('FATAL ERROR in callback/google.js:', e.message, e.stack);
        return new Response(`Authentication Error: ${e.message}. Check Worker logs for details.`, { status: 500 });
    }
}