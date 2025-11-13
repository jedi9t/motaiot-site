// /functions/api/auth/providers.js

export async function onRequest(context) {
    // 假设您只实现了 Google 登录
    const providers = {
        'google': {
            id: 'google',
            name: 'Google',
            // 确保 signinUrl 指向您在步骤一中创建的登录发起 Function
            signinUrl: '/api/auth/login/google', 
        },
        // 'github': { id: 'github', name: 'GitHub', signinUrl: '/api/auth/login/github' }
        // ...其他提供者...
    };

    return new Response(JSON.stringify(providers), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
    });
}