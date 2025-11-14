// /functions/api/auth/callback/google.js (使用 KV 验证 State)

export async function onRequest(context) {
    const { request, env } = context;
    // D1 仍用于永久用户和会话存储
    const db = env.hugo_auth_db; 

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
        return new Response('Missing code or state in callback.', { status: 400 });
    }

    try {
        // --- 1. State 验证和删除 (使用 KV) ---
        const stateValue = await env.OAUTH_STATE_KV.get(state);

        if (!stateValue) {
            // 如果 stateValue 为 null，说明 State 不存在或已过期（TTL 处理）
            console.error(`State validation failed: State ID ${state} not found or expired.`);
            return new Response('State not found or expired.', { status: 401 });
        }
        
        // 验证成功后，立即删除 KV 记录（防止重放攻击）
        await env.OAUTH_STATE_KV.delete(state);

        // --- 2. Code 换取 Tokens (保持不变) ---
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

        // --- 3. Fetch User Info (保持不变) ---
        const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!userinfoResponse.ok) {
            const errorText = await userinfoResponse.text();
            console.error('Google User Info Fetch Failed:', errorText);
            return new Response(`User info fetch failed: ${errorText}`, { status: 400 });
        }
        
        const googleUser = await userinfoResponse.json();

        // --- 4. 用户和账户管理 (使用 D1, 保持不变) ---
        let userId;
        const providerAccountId = googleUser.sub;
        const userEmail = googleUser.email;
        const newUserUUID = crypto.randomUUID(); 

        // 查找或创建用户
        const { results: userCheck } = await db.prepare(`SELECT id, emailVerified FROM users WHERE email = ?1`).bind(userEmail).all();
        
        if (userCheck.length > 0) {
            userId = userCheck[0].id;
        } else {
            // 创建新用户 (emailVerified 使用 INTEGER 毫秒时间戳)
            userId = newUserUUID; 
            await db.prepare(
                `INSERT INTO users (id, name, email, emailVerified) VALUES (?1, ?2, ?3, ?4)`
            ).bind(userId, googleUser.name, userEmail, Date.now()).run();
            console.log('New user created:', userId);
        }

        // 查找或创建账户链接
        const { results: accountCheck } = await db.prepare(`
            SELECT userId FROM accounts WHERE provider = 'google' AND providerAccountId = ?1
        `).bind(providerAccountId).all();
        
        if (accountCheck.length === 0) {
            // 创建新的账户链接 (expires_at 使用 INTEGER 毫秒时间戳)
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

        // --- 5. 创建最终会话 (使用 D1 sessions 表) ---
        const sessionToken = crypto.randomUUID();
        const sessionExpires = Date.now() + (30 * 24 * 60 * 60 * 1000); 

        // 确保 sessions 表中没有 FOREIGN KEY 约束，因为 userId 必须存在于 users 表中
        await db.prepare(
            `INSERT INTO sessions (id, userId, sessionToken, expires) VALUES (?1, ?2, ?3, ?4)`
        ).bind(
            sessionToken, 
            userId, 
            sessionToken, 
            sessionExpires
        ).run();
        
        // --- 6. 设置 Session Cookie 并重定向 ---
        const response = Response.redirect('https://motaiot.com/', 302);
        
        const cookie = `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(sessionExpires).toUTCString()}`;
        response.headers.set('Set-Cookie', cookie);
        
        console.log(`Login successful for user ${userId}. Session token set.`);
        return response;

    } catch (e) {
        console.error('FATAL ERROR in callback/google.js:', e.message, e.stack);
        return new Response(`Authentication Error: ${e.message}. Check Worker logs for details.`, { status: 500 });
    }
}