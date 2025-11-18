// /functions/api/auth/session.js

/**
 * 检查 D1 数据库中的会话是否有效且未过期
 * 假设 D1 表名为 'sessions'，字段包括 sessionId, userId, expires
 * @param {D1Database} db - D1 数据库绑定对象 (env.hugo_auth_db)
 * @param {string} sessionId - 会话ID
 * @param {string} userId - 用户ID
 * @returns {Promise<boolean>} - 如果会话有效则返回 true
 */
async function getD1Session(db, sessionId, userId) {
    const { results } = await db.prepare(
        // 查询匹配的会话，并检查是否已过期 (expires 字段存储时间戳)
        `SELECT expires FROM sessions WHERE sessionId = ?1 AND userId = ?2`
    ).bind(sessionId, userId).all();

    if (results.length === 0) {
        return false;
    }

    const session = results[0];
    const now = Date.now();
    // 检查会话是否过期 (假设 expires 存储的是毫秒时间戳)
    if (session.expires && now > session.expires) {
        // 可选：删除过期会话以清理数据库
        // db.prepare(`DELETE FROM sessions WHERE sessionId = ?1`).bind(sessionId).run();
        return false;
    }

    return true;
}

/**
 * 从 D1 数据库获取用户数据
 * 假设 D1 表名为 'users'，字段包括 id, name, email, avatar
 * @param {D1Database} db - D1 数据库绑定对象 (env.hugo_auth_db)
 * @param {string} userId - 用户ID
 * @returns {Promise<object|null>} - 用户对象 (包含 id, name, email)
 */
async function getD1User(db, userId) {
    const { results } = await db.prepare(
        `SELECT id, name, email,avatar FROM users WHERE id = ?1`
    ).bind(userId).all();
    
    // 返回第一个结果，如果没有则返回 null
    return results.length > 0 ? results[0] : null;
}


export async function onRequest(context) {
    const { request, env } = context;
    const db = env.hugo_auth_db;

    // 1. 检查 Cookie 头
    const cookieHeader = request.headers.get('Cookie');
    const sessionMatch = cookieHeader?.match(/__session=([^;]+)/); 

    if (sessionMatch) {
        try {
            // 2. 解析 Session ID 和 User ID (格式: sessionId|userId)
            const [sessionId, userId] = sessionMatch[1].split('|'); 

            // 3. 在 D1 中验证 Session 是否有效且未过期
            const { results: sessionCheck } = await db.prepare(
                `SELECT expires FROM sessions WHERE id = ?1 AND userId = ?2`
            ).bind(sessionId, userId).all();

            if (sessionCheck.length > 0 && sessionCheck[0].expires > Date.now()) {
                // 4. 获取用户数据 (假设此用户存在)
                const { results: userResult } = await db.prepare(
                    `SELECT id, name, email, avatar FROM users WHERE id = ?1`
                ).bind(userId).all();

                if (userResult.length > 0) {
                    // 5. 返回用户信息 (200 OK)
                    return new Response(JSON.stringify({ user: userResult[0] }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
        } catch (e) {
            console.error("Session API Error:", e.message);
        }
    }

    // 6. 未登录或会话无效
    return new Response(JSON.stringify({ user: null }), {
        headers: { 'Content-Type': 'application/json' }
    });
}