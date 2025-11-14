// /functions/api/auth/callback/google.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.hugo_auth_db;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
        return new Response('Missing code or state in callback.', { status: 400 });
    }

    try {
        // --- 1. State 验证和删除 (防止 CSRF 和重放攻击) ---
        // 查询 State 记录
        const { results: stateResults } = await db.prepare(
            // 确保查询的 ID 和临时用户标记 'GUEST_STATE' 匹配
            `SELECT id, expires FROM sessions WHERE id = ?1 AND userId = 'GUEST_STATE'`
        ).bind(state).all();

        if (stateResults.length === 0) {
            console.error(`State validation failed: State ID ${state} not found.`);
            return new Response('State not found or expired.', { status: 401 });
        }
        
        const stateRecord = stateResults[0];
        const currentTime = Date.now(); 

        // 检查过期时间 (expires 是 INTEGER 毫秒时间戳)
        if (stateRecord.expires < currentTime) {
            console.error(`State validation failed: State ID ${state} expired.`);
            return new Response('State expired.', { status: 401 });
        }

        // 立即删除临时 State 记录
        await db.prepare(`DELETE FROM sessions WHERE id = ?1 AND userId = 'GUEST_STATE'`).bind(state).run();

        // --- 2. Code 换取 Tokens ---
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: env.GOOGLE_ID,
                client_secret: env.GOOGLE_SECRET,
                // 确保 redirect_uri 必须与 Google 控制台设置的完全匹配
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
        const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!userinfoResponse.ok) {
            const errorText = await userinfoResponse.text();
            console.error('Google User Info Fetch Failed:', errorText);
            return new Response(`User info fetch failed: ${errorText}`, { status: 400 });
        }
        
        const googleUser = await userinfoResponse.json();

        // --- 4. 用户和账户管理 (手动适配 Auth.js 模型) ---
        let userId;
        const providerAccountId = googleUser.sub; // Google 的唯一用户 ID
        const userEmail = googleUser.email;
        const newUserUUID = crypto.randomUUID(); 

        // a. 查找或创建用户 (users 表)
        const { results: userCheck } = await db.prepare(`SELECT id, emailVerified FROM users WHERE email = ?1`).bind(userEmail).all();
        
        if (userCheck.length > 0) {
            userId = userCheck[0].id;
        } else {
            // 创建新用户
            userId = newUserUUID; 
            await db.prepare(
                `INSERT INTO users (id, name, email, emailVerified) VALUES (?1, ?2, ?3, ?4)`
            ).bind(userId, googleUser.name, userEmail, Date.now()).run();
            console.log('New user created:', userId);
        }

        // b. 查找或创建账户链接 (accounts 表)
        const { results: accountCheck } = await db.prepare(`
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
        // 设置 30 天过期时间 (INTEGER 毫秒时间戳)
        const sessionExpires = Date.now() + (30 * 24 * 60 * 60 * 1000); 

        await db.prepare(
            `INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?1, ?2, ?3, ?4)`
        ).bind(
            sessionToken, // 使用 sessionToken 作为 primary key ID
            userId, 
            sessionToken, 
            sessionExpires
        ).run();
        
        // --- 6. 设置 Session Cookie 并重定向 ---
        const response = Response.redirect('https://motaiot.com/', 302);
        
        // 设置 HTTPOnly 和 Secure 的会话 Cookie
        const cookie = `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(sessionExpires).toUTCString()}`;
        response.headers.set('Set-Cookie', cookie);
        
        console.log(`Login successful for user ${userId}. Session token set.`);
        return response;

    } catch (e) {
        // 捕获所有错误
        console.error('FATAL ERROR in callback/google.js:', e.message, e.stack);
        return new Response(`Authentication Error: ${e.message}. Check Worker logs for details.`, { status: 500 });
    }
}