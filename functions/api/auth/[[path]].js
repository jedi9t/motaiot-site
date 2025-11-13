// functions/auth/[[path]].js

// 🚨 修正: 在 Cloudflare Pages Functions (Edge Runtime) 中，
// 应该使用 @auth/core 来替代 next-auth。

import { Auth } from "@auth/core"; 
// import NextAuth from "next-auth"
// import { D1Adapter } from "@auth/d1-adapter";

// 导入身份提供者
// import Google from "@auth/core/providers/google"; 
// import Discord from "@auth/core/providers/discord";
// import LinkedIn from "@auth/core/providers/linkedin"; 
// import Reddit from "@auth/core/providers/reddit";
// import Twitter from "@auth/core/providers/twitter"; 
//GOOGLE: https://authjs.dev/getting-started/providers/google
// import Google from "next-auth/providers/google"; 
// import Discord from "next-auth/providers/discord";
// import LinkedIn from "next-auth/providers/linkedin"; 
// import Reddit from "next-auth/providers/reddit";
// import Twitter from "next-auth/providers/twitter"; 

/**
 * Auth.js 的配置选项
 * @param {object} env - Cloudflare Pages Functions 提供的环境绑定和变量
 */
const authOptions = (env) => ({
  // 1. D1 适配器配置：使用 Pages Functions 注入的 D1 绑定
  // 注意：hugo_auth_db 必须在 Cloudflare Pages 仪表板中正确绑定到 D1 数据库
  // adapter: D1Adapter(env.hugo_auth_db), 
  
  // 2. 会话策略
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  
  // 3. 配置 Providers
  providers: [
    // Google({ clientId: env.GOOGLE_ID, clientSecret: env.GOOGLE_SECRET }),
    // Discord({ clientId: env.DISCORD_ID, clientSecret: env.DISCORD_SECRET }),
    // LinkedIn({ clientId: env.LINKEDIN_ID, clientSecret: env.LINKEDIN_SECRET }),
    // Reddit({ clientId: env.REDDIT_ID, clientSecret: env.REDDIT_SECRET }),
    // Twitter({ clientId: env.TWITTER_ID, clientSecret: env.TWITTER_SECRET }),
  ],

  // 4. 必需的密钥
  secret: env.AUTH_SECRET,
  
  // 5. ⚠️ 修正：在 Pages Functions 中不需要设置 basePath，路径由文件路由决定
  // basePath: "/api/auth", 

  // 6. 回调函数：将用户ID添加到 JWT 和 Session 中
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user 是在第一次登录时从数据库获取的 User 对象
        token.id = user.id; 
      }
      return token;
    },
    async session({ session, token }) {
      // 从 token 中获取 ID 并添加到 session.user 对象
      if (token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
});

/**
 * Cloudflare Pages Functions 的入口点
 * @param {object} context - 包含 request, env, params 的对象
 */
export async function onRequest(context) {
  const config = authOptions(context.env);

  // 1. 获取 Auth.js 所需的动态路径部分 (例如：['session'] 或 ['signin', 'github'])
  // Cloudflare Pages 会将 [[path]] 的值放在 context.params._path
  const path = context.params._path; 

  // 2. 构造 Auth.js 期望的内部 URL 结构
  // Auth.js 核心需要一个基础的 /auth 路径前缀
  const authUrl = new URL(context.request.url);
  
  // 关键修正：手动设置 pathname 为 /auth/[path segments]
  // 确保 Auth.js 认为它是标准 NextAuth API 路由
  authUrl.pathname = `/auth/${path.join('/')}`; 

  // 3. 调用 Auth.js 核心
  return Auth(new Request(authUrl, context.request), config);
}
// export async function onRequest(context) {
//   // 1. 获取 Auth.js 配置
//   const config = authOptions(context.env);

//   // 2. 路径重写：Auth.js 核心期望的请求路径不包含 Pages Function 的文件路由前缀。
//   // 我们将 /auth 路由段移除，以匹配 Auth.js 内部的路由期望。
//   const url = new URL(context.request.url);
//   // url.pathname = url.pathname.replace('/auth', ''); 
//   url.pathname = url.pathname.replace('/api/auth', '');

//   // 3. 创建一个新的请求对象，保留原有信息但使用新的 URL 路径
//   const requestWithNewUrl = new Request(url, context.request);

//   // 4. 调用 Auth.js 核心
//   return Auth(requestWithNewUrl, config);
// }