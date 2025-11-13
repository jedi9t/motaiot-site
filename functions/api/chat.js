// /functions/api/chat.js

export async function onRequest(context) {
    // 1. 认证检查（简化）：在 Edge Runtime 中，您需要手动验证 Session JWT
    // 这是一个复杂步骤，但简单来说，您可以依赖 Auth.js 设置的 Cookie 
    // 并仅对已登录用户提供 API 服务。

    if (context.request.method === "POST") {
        const d1 = context.env.hugo_auth_db;
        const { userId, message } = await context.request.json();
        
        if (!userId) {
            return new Response("Unauthorized", { status: 401 });
        }

        // 2. 模拟/调用 AI 服务
        const aiResponse = `这是对 "${message}" 的 AI 回复。`; // 替换为实际的 AI 调用

        // 3. 持久化到 D1 数据库
        await d1.prepare(
            `INSERT INTO ChatHistory (id, userId, userMessage, aiResponse, timestamp) 
             VALUES (?, ?, ?, ?, ?)`
        ).bind(
            crypto.randomUUID(), 
            userId, 
            message, 
            aiResponse, 
            Date.now()
        ).run();

        // 4. 返回响应
        return new Response(JSON.stringify({ reply: aiResponse }), {
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response("Method Not Allowed", { status: 405 });
}